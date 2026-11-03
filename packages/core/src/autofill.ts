/**
 * Data behind the Chrome extension's "Fill this application" feature.
 * Only verified profile facts are returned. The extension fills fields on the page;
 * it never submits a form.
 */
import type { Tx } from "@careerflow/database";
import { STATUS_RANK } from "@careerflow/shared";
import { createApplication, setStatusManually } from "./applications";
import { getCareerContext } from "./career-memory";
import { saveApprovedAnswer } from "./letters";
import { readDocument } from "./storage";

export interface AutofillData {
  profile: {
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    linkedin: string | null;
    github: string | null;
    portfolio: string | null;
    headline: string | null;
    summary: string | null;
    yearsExperience: number | null;
    noticePeriodDays: number | null;
    currentCtcLpa: number | null;
    expectedCtcLpa: number | null;
    expectedCtcText: string | null;
    currentCompany: string | null;
    currentTitle: string | null;
  };
  education: { institution: string; degree: string | null; field: string | null; endYear: number | null; grade: string | null }[];
  skills: string[];
  answers: { question: string; answer: string }[];
  resume: { available: boolean; fileName: string | null; mime: string | null; sizeBytes: number | null };
  missing: string[];
}

const INDIAN_STATES = /(andhra|arunachal|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal|jharkhand|karnataka|kerala|madhya|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|punjab|rajasthan|sikkim|tamil|telangana|tripura|uttar|uttarakhand|west bengal|delhi)/i;

/** "Bengaluru, Karnataka, India" → city/state/country (best effort, India-first). */
export function splitLocation(location: string | null): { city: string | null; state: string | null; country: string | null } {
  if (!location) return { city: null, state: null, country: null };
  const parts = location.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? null;
  const country = parts.length > 1 && !INDIAN_STATES.test(parts[parts.length - 1]) ? parts[parts.length - 1] : "India";
  const state = parts.find((p, i) => i > 0 && INDIAN_STATES.test(p)) ?? null;
  return { city, state, country };
}

export function splitName(full: string | null): { firstName: string | null; lastName: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

async function primaryResume(tx: Tx) {
  return tx.one<{ document_id: string; title: string; mime_type: string; size_bytes: number; storage_path: string }>(
    `select m.document_id, d.title, d.mime_type, d.size_bytes, d.storage_path
       from master_resumes m join documents d on d.id = m.document_id
      order by m.is_primary desc, m.created_at desc limit 1`,
  );
}

export async function getAutofillData(tx: Tx): Promise<AutofillData> {
  const ctx = await getCareerContext(tx, { includeAnswers: false });
  const cp = await tx.one<{ phone: string | null }>("select phone from career_profiles limit 1");
  const answers = await tx.query<{ question: string; answer: string }>("select question, answer from approved_answers order by updated_at desc limit 200");
  const resume = await primaryResume(tx);
  const p = ctx.profile;
  const current = ctx.employment.find((e) => e.current) ?? ctx.employment[0];
  const { firstName, lastName } = splitName(p.fullName);
  const loc = splitLocation(p.location);
  const expectedCtcLpa = p.expectedCtcMinLpa;
  const profile: AutofillData["profile"] = {
    fullName: p.fullName,
    firstName,
    lastName,
    email: p.email,
    phone: cp?.phone ?? null,
    location: p.location,
    ...loc,
    linkedin: p.links.linkedin,
    github: p.links.github,
    portfolio: p.links.portfolio,
    headline: p.headline,
    summary: p.summary,
    yearsExperience: p.yearsExperience,
    noticePeriodDays: p.noticePeriodDays,
    currentCtcLpa: p.currentCtcLpa,
    expectedCtcLpa,
    expectedCtcText: expectedCtcLpa !== null ? `${expectedCtcLpa}${p.expectedCtcMaxLpa ? `-${p.expectedCtcMaxLpa}` : ""} LPA` : null,
    currentCompany: current?.company ?? null,
    currentTitle: current?.title ?? p.headline ?? null,
  };
  const labels: Record<string, string> = { phone: "Phone", location: "Location", linkedin: "LinkedIn URL", yearsExperience: "Years of experience", noticePeriodDays: "Notice period", currentCtcLpa: "Current CTC", expectedCtcLpa: "Expected CTC" };
  const missing = Object.entries(labels).filter(([k]) => profile[k as keyof typeof profile] === null || profile[k as keyof typeof profile] === "").map(([, v]) => v);
  if (!resume) missing.push("Resume");
  return {
    profile,
    education: ctx.education.map((e) => ({ institution: e.institution, degree: e.degree ?? null, field: e.field ?? null, endYear: e.endYear ?? null, grade: e.grade ?? null })),
    skills: ctx.skills.map((s) => s.name).slice(0, 40),
    answers,
    resume: { available: !!resume, fileName: resume?.title ?? null, mime: resume?.mime_type ?? null, sizeBytes: resume ? Number(resume.size_bytes) : null },
    missing,
  };
}

/** The resume file to attach to application forms (the primary master resume). */
export async function getResumeFile(tx: Tx): Promise<{ fileName: string; mime: string; base64: string } | null> {
  const r = await primaryResume(tx);
  if (!r) return null;
  const { doc, data } = await readDocument(tx, r.document_id);
  const ext = doc.mime_type.includes("pdf") ? ".pdf" : doc.mime_type.includes("word") ? ".docx" : "";
  const fileName = /\.\w{2,4}$/.test(doc.title) ? doc.title : `${doc.title}${ext}`;
  return { fileName, mime: doc.mime_type, base64: data.toString("base64") };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Saves answers the user typed into forms, so the next form can fill them. Same question → answer updated. */
export async function saveLearnedAnswers(tx: Tx, userId: string, items: { question: string; answer: string }[]) {
  const existing = await tx.query<{ id: string; question: string }>("select id, question from approved_answers");
  let saved = 0;
  for (const it of items.slice(0, 25)) {
    const q = it.question.trim().slice(0, 500);
    const a = it.answer.trim().slice(0, 4000);
    if (q.length < 3 || !a) continue;
    const match = existing.find((e) => norm(e.question) === norm(q));
    await saveApprovedAnswer(tx, userId, { id: match?.id, question: match?.question ?? q, answer: a, tags: ["learned-from-form"] });
    saved++;
  }
  return { saved };
}

/**
 * Records a submitted application from the extension. Reuses an existing application for the same
 * job (no duplicates) and moves it to Applied only if it was not already further along.
 */
export async function markAppliedFromExtension(
  tx: Tx,
  userId: string,
  job: { company: string; roleTitle: string; url: string; portal?: string | null; description?: string | null; location?: string | null },
) {
  const r = await createApplication(
    tx,
    userId,
    { company: job.company, roleTitle: job.roleTitle, jobUrl: job.url, jobPortal: job.portal ?? null, jobDescription: job.description ?? null, location: job.location ?? null, status: "saved" },
    { source: "extension" },
  );
  const app = r.application;
  let moved = false;
  if (STATUS_RANK[app.status as keyof typeof STATUS_RANK] < STATUS_RANK.applied) {
    await setStatusManually(tx, userId, app.id, "applied", "Submitted through the application form (detected by the Chrome extension)");
    moved = true;
  }
  return { id: app.id, existing: !!r.duplicateOf, moved, status: moved ? "applied" : app.status };
}
