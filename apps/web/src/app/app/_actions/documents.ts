"use server";

import { redirect } from "next/navigation";
import { readDocxParagraphs } from "@careerflow/document-engine";
import {
  approveReconstructedTemplate,
  buildApplicationPackage,
  createMatchReport,
  createTailorDraft,
  decideChange,
  deleteDocument,
  exportCoverLetter,
  generateCoverLetter,
  manualEdit,
  renderTailoredResume,
  replaceTemplate,
  saveDocument,
  suggestTailoring,
  templateFor,
  updateCoverLetter,
  uploadMasterResume,
  validateUpload,
  type MasterResumeRow,
} from "@careerflow/core";
import { act, fileFrom, optStr, str, type ActionState } from "@/lib/action";
import { assertRateLimit } from "@/lib/rate-limit";
import { userDb, withUser } from "@/lib/session";

export async function uploadDocumentAction(_: ActionState, f: FormData) {
  return act(async () => {
    const file = await fileFrom(f, "file");
    if (!file) throw new Error("Choose a file to upload.");
    const err = validateUpload(file.name, file.mime, file.data);
    if (err) throw new Error(err);
    const kind = str(f, "kind") || "other";
    await withUser((tx, u) => saveDocument(tx, u.id, { kind, title: str(f, "title") || file.name, fileName: file.name, mime: file.mime, data: file.data, sensitive: kind === "identity" || f.get("sensitive") === "on", parentId: optStr(f, "parentId"), applicationId: optStr(f, "applicationId") }));
    return { message: optStr(f, "parentId") ? "New version uploaded." : "Uploaded." };
  }, ["/app/documents"]);
}

export async function deleteDocumentAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => deleteDocument(tx, str(f, "id")));
    return { message: "Deleted." };
  }, ["/app/documents", "/app/resume"]);
}

export async function uploadResumeAction(_: ActionState, f: FormData) {
  return act(async () => {
    const file = await fileFrom(f, "file");
    if (!file) throw new Error("Choose your resume file (PDF or DOCX).");
    const { user, db } = await userDb();
    assertRateLimit(user.id, "upload", 10, 60_000);
    const r = await uploadMasterResume(db, user.id, file, optStr(f, "label") ?? undefined);
    return {
      message: `Resume saved. ${r.factsAdded} item(s) were extracted (${r.parseMethod === "ai" ? "with AI" : "rule-based"}) and are waiting for your review in My Career Profile.${r.resume.format === "pdf" ? " Because it is a PDF, review and approve the rebuilt editable template before tailoring." : ""}`,
    };
  }, ["/app/resume", "/app/profile"]);
}

export async function setPrimaryResumeAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser(async (tx) => {
      await tx.query("update master_resumes set is_primary = false");
      await tx.query("update master_resumes set is_primary = true where id = $1", [str(f, "id")]);
    });
  }, ["/app/resume"]);
}

export async function approveTemplateAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => approveReconstructedTemplate(tx, str(f, "id")));
    return { message: "Template approved. It will be used for tailoring." };
  }, ["/app/resume"]);
}

export async function replaceTemplateAction(_: ActionState, f: FormData) {
  return act(async () => {
    const file = await fileFrom(f, "file");
    if (!file) throw new Error("Choose the edited DOCX template.");
    await withUser((tx, u) => replaceTemplate(tx, u.id, str(f, "id"), file));
    return { message: "Your edited template is saved and approved." };
  }, ["/app/resume"]);
}

export async function startTailoringAction(_: ActionState, f: FormData) {
  let draftId: string | null = null;
  const r = await act(async () => {
    const { user, db } = await userDb();
    const masterId = str(f, "masterResumeId");
    let appId = optStr(f, "applicationId");
    const jd = str(f, "jobDescription");
    if (!masterId) throw new Error("Upload a master resume first.");
    if (!appId && jd) {
      // A pasted JD without an application creates a saved opportunity so documents stay linked to the job
      const company = str(f, "company") || "Unknown company";
      const role = str(f, "roleTitle") || "Untitled role";
      const { createApplication } = await import("@careerflow/core");
      appId = (await db.withUser(user.id, (tx) => createApplication(tx, user.id, { company, roleTitle: role, jobDescription: jd, status: "preparing" }))).application.id;
    }
    let reportId: string | null = null;
    const app = appId ? await db.withUser(user.id, (tx) => tx.one("select company, role_title, job_description from applications where id = $1", [appId])) : null;
    const desc = jd || app?.job_description;
    if (desc) reportId = (await createMatchReport(db, user.id, appId, desc, { company: app?.company, roleTitle: app?.role_title })).id;
    draftId = await db.withUser(user.id, async (tx) => {
      const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [masterId]);
      if (!mr) throw new Error("Resume not found");
      await templateFor(tx, mr); // throws if a PDF template still needs approval
      return createTailorDraft(tx, user.id, masterId, appId, reportId);
    });
  });
  if (r.ok && draftId) redirect(`/app/resume/tailor/${draftId}`);
  return r;
}

export async function suggestTailoringAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const id = str(f, "id");
    const jd = await db.withUser(user.id, (tx) =>
      tx.one<{ jd: string | null }>("select coalesce(a.job_description, '') as jd from tailored_resumes t left join applications a on a.id = t.application_id where t.id = $1", [id]),
    );
    if (!jd?.jd) throw new Error("Add the job description to this application first so AI knows what to tailor for.");
    const r = await suggestTailoring(db, user.id, id, jd.jd);
    return { message: `${r.added} suggestion(s) added${r.blocked ? `; ${r.blocked} blocked by the fabrication check` : ""}.` };
  }, ["/app/resume/tailor/[id]"]);
}

export async function decideChangeAction(_: ActionState, f: FormData) {
  return act(async () => {
    const decision = str(f, "decision") as "accepted" | "rejected" | "edited";
    await withUser((tx) => decideChange(tx, str(f, "id"), str(f, "changeId"), decision, optStr(f, "text") ?? undefined));
  }, ["/app/resume/tailor/[id]"]);
}

export async function manualEditAction(_: ActionState, f: FormData) {
  return act(async () => {
    const id = str(f, "id");
    const index = Number(str(f, "paragraphIndex"));
    await withUser(async (tx) => {
      const t = await tx.one("select master_resume_id from tailored_resumes where id = $1", [id]);
      const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [t!.master_resume_id]);
      const paras = await readDocxParagraphs(await templateFor(tx, mr!));
      const p = paras[index];
      if (!p || !p.editable) throw new Error("This paragraph is locked (employer, title, dates or education).");
      await manualEdit(tx, id, p, str(f, "text").slice(0, 1500));
    });
    return { message: "Edit saved." };
  }, ["/app/resume/tailor/[id]"]);
}

export async function renderTailoredAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "render", 20, 60_000);
    const r = await renderTailoredResume(db, user.id, str(f, "id"));
    return { message: r.validation.warnings.length ? `Documents created with ${r.validation.warnings.length} note(s) to check.` : "Documents created.", data: r };
  }, ["/app/resume/tailor/[id]"]);
}

export async function generateLetterAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const tone = (str(f, "tone") || "professional") as any;
    const r = await generateCoverLetter(db, user.id, { applicationId: str(f, "applicationId"), tone });
    return { message: r.issues.length ? `Draft created. ${r.issues.length} sentence(s) mention details not in your verified profile — please review them.` : "Draft created.", data: r };
  }, ["/app/cover-letters"]);
}

export async function saveLetterAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => updateCoverLetter(tx, str(f, "id"), str(f, "content")));
    return { message: "Saved." };
  }, ["/app/cover-letters"]);
}

export async function exportLetterAction(_: ActionState, f: FormData) {
  return act(async () => {
    const r = await withUser((tx, u) => exportCoverLetter(tx, u.id, str(f, "id")));
    return { message: "DOCX and PDF created.", data: r };
  }, ["/app/cover-letters"]);
}

export async function packageAction(_: ActionState, f: FormData) {
  return act(async () => {
    const r = await withUser((tx, u) => buildApplicationPackage(tx, u.id, str(f, "applicationId")));
    return { message: `Package created with ${r.files.length} file(s).`, data: r };
  }, ["/app/applications/[id]", "/app/cover-letters", "/app/documents"]);
}

export async function matchReportAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 20, 60_000);
    const appId = str(f, "applicationId");
    const jd = str(f, "jobDescription");
    const app = await db.withUser(user.id, (tx) => tx.one("select company, role_title, job_description from applications where id = $1", [appId]));
    const text = jd || app?.job_description;
    if (!text) throw new Error("Paste the job description first.");
    if (jd) await db.withUser(user.id, (tx) => tx.query("update applications set job_description = $2 where id = $1", [appId, jd.slice(0, 30000)]));
    const r = await createMatchReport(db, user.id, appId, text, { company: app?.company, roleTitle: app?.role_title });
    return { message: `Match report ready: ${r.report.label}.` };
  }, ["/app/applications/[id]"]);
}
