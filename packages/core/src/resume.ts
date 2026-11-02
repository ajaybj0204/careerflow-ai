import crypto from "node:crypto";
import { untrusted } from "@careerflow/ai";
import {
  applyDocxEdits,
  composeResumeDocx,
  convertDocxToPdf,
  DOCX_MIME,
  extractText,
  findSoffice,
  parseResumeText,
  pdfPageCount,
  readDocxParagraphs,
  renderPdf,
  type DocxParagraph,
  type PdfBlock,
} from "@careerflow/document-engine";
import { parsedResumeSchema, resumeEditSchema, type ParsedResume } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor, requireAI } from "./ai";
import { recordEvent } from "./automation";
import { allowedSkillSet, getCareerContext, importExtractedFacts, renderCareerContext } from "./career-memory";
import { checkProposedText, numbersFrom, type GuardIssue } from "./guard";
import { readDocument, saveDocument, validateUpload } from "./storage";

export interface MasterResumeRow {
  id: string;
  document_id: string;
  label: string;
  is_primary: boolean;
  format: "docx" | "pdf" | "doc";
  template_status: "docx_native" | "reconstructed_pending" | "reconstructed_approved";
  template_document_id: string | null;
  parsed: ParsedResume | null;
  created_at: string;
}

async function parseResume(db: Database, userId: string, text: string): Promise<{ parsed: ParsedResume; method: "rules" | "ai" }> {
  const rules = parseResumeText(text);
  const consent = await db.withUser(userId, (tx) => tx.one<{ ai_processing_consent: boolean }>("select ai_processing_consent from user_preferences"));
  const ai = consent?.ai_processing_consent ? aiFor(db, userId) : null;
  if (!ai) return { parsed: rules, method: "rules" };
  try {
    const { data } = await ai.generateJson({
      feature: "resume.parse",
      userId,
      schema: parsedResumeSchema,
      system: "Extract a resume into structured data exactly as written. Do not improve, infer or add anything. Dates as written (e.g. 'Jan 2023'). Use null when absent.",
      prompt: untrusted("resume", text, 20000),
      temperature: 0,
    });
    return { parsed: data, method: "ai" };
  } catch {
    return { parsed: rules, method: "rules" };
  }
}

function reconstructedSections(p: ParsedResume) {
  const sections = [] as Parameters<typeof composeResumeDocx>[0]["sections"];
  if (p.summary) sections.push({ heading: "Professional Summary", entries: [{ text: p.summary }] });
  if (p.employment.length)
    sections.push({
      heading: "Experience",
      entries: p.employment.map((e) => ({ title: `${e.title} | ${e.company}`, right: `${e.startDate ?? ""} – ${e.isCurrent ? "Present" : e.endDate ?? ""}`, bullets: e.bullets })),
    });
  if (p.projects.length) sections.push({ heading: "Projects", entries: p.projects.map((x) => ({ title: x.name, bullets: x.description ? [x.description] : [] })) });
  if (p.skills.length) sections.push({ heading: "Skills", entries: [{ text: p.skills.join(", ") }] });
  if (p.education.length)
    sections.push({ heading: "Education", entries: p.education.map((e) => ({ title: [e.degree, e.field].filter(Boolean).join(", ") || e.institution, subtitle: e.degree ? e.institution : undefined, right: e.endYear ? String(e.endYear) : undefined })) });
  if (p.certifications.length) sections.push({ heading: "Certifications", entries: [{ bullets: p.certifications.map((c) => c.name + (c.issuer ? ` — ${c.issuer}` : "")) }] });
  return sections;
}

/**
 * Uploads a master resume. The original file is stored unchanged and never overwritten.
 * DOCX: the file itself is the template. PDF: an editable template is rebuilt and must be approved.
 */
export async function uploadMasterResume(db: Database, userId: string, file: { name: string; mime: string; data: Buffer }, label?: string) {
  const err = validateUpload(file.name, file.mime, file.data);
  if (err) throw new Error(err);
  if (!["application/pdf", DOCX_MIME, "application/msword"].includes(file.mime)) throw new Error("Upload a PDF or DOCX resume.");
  let mime = file.mime;
  let data = file.data;
  if (mime === "application/msword") {
    // .doc needs LibreOffice to convert; without it the user is asked to save as .docx
    if (!findSoffice()) throw new Error("Old .doc files need converting. Please open it in Word or Google Docs and save as .docx, then upload again.");
    throw new Error("Please save the .doc file as .docx and upload again.");
  }
  const text = await extractText(data, mime);
  if (text.trim().length < 80) throw new Error("Could not read text from this file. If it is a scanned image PDF, please upload a DOCX or a text-based PDF.");
  const { parsed, method } = await parseResume(db, userId, text);

  return db.withUser(userId, async (tx) => {
    const doc = await saveDocument(tx, userId, { kind: "master_resume", title: label || file.name, fileName: file.name, mime, data });
    const count = await tx.one<{ n: number }>("select count(*)::int as n from master_resumes");
    let templateDocId: string | null = null;
    let templateStatus: MasterResumeRow["template_status"] = "docx_native";
    if (mime === "application/pdf") {
      const rebuilt = await composeResumeDocx({
        name: parsed.fullName ?? "Your Name",
        contact: [parsed.email, parsed.phone, parsed.location, ...parsed.links.slice(0, 2)].filter(Boolean).join(" | "),
        sections: reconstructedSections(parsed),
      });
      const t = await saveDocument(tx, userId, { kind: "master_resume", title: `${label || file.name} (editable template, needs approval)`, fileName: file.name.replace(/\.pdf$/i, "") + "-template.docx", mime: DOCX_MIME, data: rebuilt, parentId: doc.id });
      templateDocId = t.id;
      templateStatus = "reconstructed_pending";
    }
    const mr = await tx.one<MasterResumeRow>(
      `insert into master_resumes (user_id, document_id, label, is_primary, format, extracted_text, parsed, template_status, template_document_id)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) returning *`,
      [userId, doc.id, label || file.name, (count?.n ?? 0) === 0, mime === "application/pdf" ? "pdf" : "docx", text.slice(0, 50000), JSON.stringify(parsed), templateStatus, templateDocId],
    );
    const added = await importExtractedFacts(tx, userId, parsed, doc.id);
    return { resume: mr!, factsAdded: added, parseMethod: method };
  });
}

export async function approveReconstructedTemplate(tx: Tx, masterResumeId: string) {
  await tx.query("update master_resumes set template_status = 'reconstructed_approved' where id = $1 and template_status = 'reconstructed_pending'", [masterResumeId]);
}

/** Replaces the rebuilt template with a DOCX the user edited and re-uploaded. */
export async function replaceTemplate(tx: Tx, userId: string, masterResumeId: string, file: { name: string; mime: string; data: Buffer }) {
  const err = validateUpload(file.name, file.mime, file.data);
  if (err) throw new Error(err);
  if (file.mime !== DOCX_MIME) throw new Error("The template must be a DOCX file.");
  const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [masterResumeId]);
  if (!mr) throw new Error("Resume not found");
  const doc = await saveDocument(tx, userId, { kind: "master_resume", title: `${mr.label} (approved template)`, fileName: file.name, mime: DOCX_MIME, data: file.data, parentId: mr.template_document_id ?? mr.document_id });
  await tx.query("update master_resumes set template_document_id = $2, template_status = 'reconstructed_approved' where id = $1", [masterResumeId, doc.id]);
}

/** The DOCX used as the template for tailoring (original DOCX, or the approved rebuilt template). */
export async function templateFor(tx: Tx, mr: MasterResumeRow): Promise<Buffer> {
  if (mr.format === "docx") return (await readDocument(tx, mr.document_id)).data;
  if (mr.template_status !== "reconstructed_approved" || !mr.template_document_id)
    throw new Error("This resume was uploaded as a PDF. Review and approve its editable template first.");
  return (await readDocument(tx, mr.template_document_id)).data;
}

export interface TailorChange {
  id: string;
  paragraphIndex: number;
  role: string;
  original: string;
  proposed: string;
  reason: string;
  issues: GuardIssue[];
  decision: "pending" | "accepted" | "rejected" | "edited" | "blocked";
  final: string | null;
  author: "ai" | "user";
}

export async function getTailorParagraphs(tx: Tx, masterResumeId: string) {
  const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [masterResumeId]);
  if (!mr) throw new Error("Resume not found");
  return { mr, paragraphs: await readDocxParagraphs(await templateFor(tx, mr)) };
}

/** Creates an empty tailoring draft (manual editing works without AI). */
export async function createTailorDraft(tx: Tx, userId: string, masterResumeId: string, applicationId: string | null, matchReportId: string | null = null) {
  const row = await tx.one<{ id: string }>(
    "insert into tailored_resumes (user_id, master_resume_id, application_id, job_match_report_id, changes) values ($1,$2,$3,$4,'[]'::jsonb) returning id",
    [userId, masterResumeId, applicationId, matchReportId],
  );
  return row!.id;
}

/** AI suggestions for an existing draft. Every suggestion passes the fabrication guard or is blocked with a reason. */
export async function suggestTailoring(db: Database, userId: string, tailoredId: string, jd: string) {
  const ai = requireAI(db, userId);
  const { paragraphs, ctx, unverifiedNames } = await db.withUser(userId, async (tx) => {
    const t = await tx.one("select * from tailored_resumes where id = $1", [tailoredId]);
    if (!t) throw new Error("Draft not found");
    const { paragraphs } = await getTailorParagraphs(tx, t.master_resume_id);
    return { paragraphs, ctx: await getCareerContext(tx), unverifiedNames: [] as string[] };
  });
  const editable = paragraphs.filter((p) => p.editable && p.text.trim().length > 3);
  if (!editable.length) throw new Error("No editable paragraphs were found in this resume template.");
  const { data } = await ai.generateJson({
    feature: "resume.tailor",
    userId,
    schema: resumeEditSchema,
    system: `You tailor a resume to a job description by rewording existing paragraphs.
Rules:
- Only edit paragraphs listed in <editable_paragraphs>, referenced by their index.
- Keep every fact the same: no new skills, tools, numbers, employers, titles, dates, certifications or achievements.
- You may: improve the summary, reword bullets to emphasise relevant work, use the job's terminology for things the candidate verifiably did, reorder items in a skills line.
- Keep each paragraph within about 10% of its original length so the layout does not overflow.
- Give a short reason for each edit. Skip paragraphs that are already well aligned.`,
    prompt: [
      renderCareerContext(ctx),
      "<editable_paragraphs>",
      JSON.stringify(editable.map((p) => ({ index: p.index, role: p.role, section: p.section, text: p.text }))),
      "</editable_paragraphs>",
      untrusted("job_description", jd, 12000),
    ].join("\n"),
    temperature: 0.4,
  });
  void unverifiedNames;
  return db.withUser(userId, async (tx) => {
    const t = await tx.one("select * from tailored_resumes where id = $1", [tailoredId]);
    if (!t) throw new Error("Draft not found");
    const allowedSkills = allowedSkillSet(ctx);
    const allowedNumbers = numbersFrom([...ctx.achievements.map((a) => `${a.description} ${a.metric ?? ""}`), ...ctx.employment.flatMap((e) => e.bullets), ctx.profile.summary, String(ctx.profile.yearsExperience ?? "")]);
    const allowedOrgs = [...ctx.employment.map((e) => e.company.toLowerCase()), ...ctx.education.map((e) => e.institution.toLowerCase()), ...ctx.certifications.map((c) => (c.issuer ?? "").toLowerCase())].filter(Boolean);
    const byIndex = new Map(paragraphs.map((p) => [p.index, p]));
    const existing: TailorChange[] = (t.changes ?? []).filter((c: TailorChange) => c.decision !== "pending" && c.decision !== "blocked");
    const fresh: TailorChange[] = [];
    for (const e of data.edits) {
      const p = byIndex.get(e.paragraphIndex);
      if (!p || !p.editable) continue;
      if (existing.some((c) => c.paragraphIndex === e.paragraphIndex)) continue;
      if (e.proposed.trim() === p.text.trim()) continue;
      const issues = checkProposedText({ original: p.text, proposed: e.proposed, allowedSkills, allowedNumbers, allowedOrgs });
      fresh.push({ id: crypto.randomUUID(), paragraphIndex: p.index, role: p.role, original: p.text, proposed: e.proposed.trim(), reason: e.reason, issues, decision: issues.length ? "blocked" : "pending", final: null, author: "ai" });
    }
    const changes = [...existing, ...fresh].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
    await tx.query("update tailored_resumes set changes = $2::jsonb, status = 'draft' where id = $1", [tailoredId, JSON.stringify(changes)]);
    return { added: fresh.length, blocked: fresh.filter((f) => f.decision === "blocked").length, notes: data.notes };
  });
}

export async function decideChange(tx: Tx, tailoredId: string, changeId: string, decision: "accepted" | "rejected" | "edited", editedText?: string) {
  const t = await tx.one("select changes from tailored_resumes where id = $1", [tailoredId]);
  if (!t) throw new Error("Draft not found");
  const changes: TailorChange[] = t.changes;
  const c = changes.find((x) => x.id === changeId);
  if (!c) throw new Error("Change not found");
  if (c.decision === "blocked" && decision === "accepted") throw new Error("This suggestion was blocked because it adds information that is not in your verified profile. Edit it yourself instead.");
  c.decision = decision;
  c.final = decision === "edited" ? (editedText ?? "").trim() : decision === "accepted" ? c.proposed : null;
  await tx.query("update tailored_resumes set changes = $2::jsonb, status = 'draft' where id = $1", [tailoredId, JSON.stringify(changes)]);
}

/** Adds or updates a manual edit by the user for one paragraph. */
export async function manualEdit(tx: Tx, tailoredId: string, paragraph: DocxParagraph, text: string) {
  const t = await tx.one("select changes from tailored_resumes where id = $1", [tailoredId]);
  const changes: TailorChange[] = (t?.changes ?? []).filter((c: TailorChange) => c.paragraphIndex !== paragraph.index);
  if (text.trim() && text.trim() !== paragraph.text.trim())
    changes.push({ id: crypto.randomUUID(), paragraphIndex: paragraph.index, role: paragraph.role, original: paragraph.text, proposed: text.trim(), reason: "Your edit", issues: [], decision: "edited", final: text.trim(), author: "user" });
  changes.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  await tx.query("update tailored_resumes set changes = $2::jsonb, status = 'draft' where id = $1", [tailoredId, JSON.stringify(changes)]);
}

function simplifiedBlocks(paragraphs: DocxParagraph[], edits: Map<number, string>): PdfBlock[] {
  return paragraphs
    .filter((p) => p.text.trim())
    .map((p, i) => {
      const text = edits.get(p.index) ?? p.text;
      const kind: PdfBlock["kind"] = i === 0 ? "title" : p.role === "heading" ? "heading" : p.role === "bullet" ? "bullet" : p.role === "role_header" ? "subheading" : p.role === "contact" ? "small" : "body";
      return { text: kind === "bullet" ? text.replace(/^[•●▪◦‣\-–*]\s*/, "") : text, kind };
    });
}

/** Builds the final DOCX + PDF from accepted changes, with layout checks, and stores both. */
export async function renderTailoredResume(db: Database, userId: string, tailoredId: string) {
  return db.withUser(userId, async (tx) => {
    const t = await tx.one("select * from tailored_resumes where id = $1", [tailoredId]);
    if (!t) throw new Error("Draft not found");
    const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [t.master_resume_id]);
    const template = await templateFor(tx, mr!);
    const paragraphs = await readDocxParagraphs(template);
    const finalEdits = (t.changes as TailorChange[]).filter((c) => (c.decision === "accepted" || c.decision === "edited") && c.final).map((c) => ({ paragraphIndex: c.paragraphIndex, text: c.final! }));
    const docx = await applyDocxEdits(template, finalEdits);

    // Layout checks
    const origChars = paragraphs.reduce((s, p) => s + p.text.length, 0);
    const newChars = (await readDocxParagraphs(docx)).reduce((s, p) => s + p.text.length, 0);
    const growth = origChars ? (newChars - origChars) / origChars : 0;
    const grownParagraphs = finalEdits.filter((e) => {
      const o = paragraphs[e.paragraphIndex]?.text.length ?? 0;
      return o > 0 && e.text.length > o * 1.2 && e.text.length - o > 25;
    }).length;
    let pdf = await convertDocxToPdf(docx);
    let pdfMode: "exact" | "simplified" = "exact";
    let pages: { original: number | null; tailored: number | null } = { original: null, tailored: null };
    if (pdf) {
      const origPdf = await convertDocxToPdf(template);
      pages = { original: origPdf ? await pdfPageCount(origPdf) : null, tailored: await pdfPageCount(pdf) };
    } else {
      pdfMode = "simplified";
      pdf = await renderPdf(simplifiedBlocks(paragraphs, new Map(finalEdits.map((e) => [e.paragraphIndex, e.text]))), { title: mr!.label });
    }
    const warnings: string[] = [];
    if (pages.original !== null && pages.tailored !== null && pages.tailored > pages.original) warnings.push(`The tailored resume runs to ${pages.tailored} pages; the original has ${pages.original}. Shorten some edits.`);
    if (pdfMode === "simplified" && growth > 0.04) warnings.push(`Text is ${Math.round(growth * 100)}% longer than the original, which may push content to another page. Open the DOCX to check.`);
    if (grownParagraphs) warnings.push(`${grownParagraphs} edited paragraph(s) are noticeably longer and may wrap onto an extra line.`);
    if (pdfMode === "simplified") warnings.push("LibreOffice is not installed on the server, so the PDF uses a simplified layout. The DOCX keeps your exact template; export it to PDF from Word or Google Docs for an identical PDF.");

    const app = t.application_id ? await tx.one("select company, role_title from applications where id = $1", [t.application_id]) : null;
    const base = (app ? `Resume - ${app.company} - ${app.role_title}` : `Resume - ${mr!.label}`).replace(/[^\w\- ]+/g, "").slice(0, 80);
    const dDoc = await saveDocument(tx, userId, { kind: "tailored_resume", title: `${base}.docx`, fileName: `${base}.docx`, mime: DOCX_MIME, data: docx, applicationId: t.application_id });
    const dPdf = await saveDocument(tx, userId, { kind: "tailored_resume", title: `${base}.pdf`, fileName: `${base}.pdf`, mime: "application/pdf", data: pdf, applicationId: t.application_id });
    const validation = { pdfMode, pages, growth: Math.round(growth * 1000) / 10, warnings, appliedEdits: finalEdits.length, checkedAt: new Date().toISOString() };
    await tx.query("update tailored_resumes set docx_document_id = $2, pdf_document_id = $3, validation = $4::jsonb, status = 'final' where id = $1", [tailoredId, dDoc.id, dPdf.id, JSON.stringify(validation)]);
    if (t.application_id) await recordEvent(tx, userId, { applicationId: t.application_id, type: "resume_prepared", source: "manual", payload: { tailoredResumeId: tailoredId } });
    return { docxId: dDoc.id, pdfId: dPdf.id, validation };
  });
}

/** Marks which resume version was actually submitted for an application. */
export async function markSubmittedVersion(tx: Tx, applicationId: string, tailoredId: string) {
  await tx.query("update tailored_resumes set status = 'final' where application_id = $1 and status = 'submitted'", [applicationId]);
  await tx.query("update tailored_resumes set status = 'submitted' where id = $1", [tailoredId]);
  await tx.query("update applications set resume_version_id = $2 where id = $1", [applicationId, tailoredId]);
}
