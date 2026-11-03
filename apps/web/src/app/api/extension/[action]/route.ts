import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@careerflow/database";
import { answerQuestion, createApplication, getAutofillData, getCareerContext, getResumeFile, markAppliedFromExtension, recordEvent, saveLearnedAnswers, setStatusManually } from "@careerflow/core";
import { appUrl } from "@/lib/config";
import { cors, withExtension } from "@/lib/extension";

const saveSchema = z.object({
  company: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
  description: z.string().max(30000).optional().nullable(),
  portal: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  externalJobId: z.string().max(100).optional().nullable(),
});

const jobSchema = z.object({
  company: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
  portal: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(30000).optional().nullable(),
});

const draftSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  charLimit: z.number().int().min(20).max(10000).optional().nullable(),
  job: z
    .object({ company: z.string().max(200).optional().nullable(), roleTitle: z.string().max(200).optional().nullable(), description: z.string().max(12000).optional().nullable() })
    .optional()
    .nullable(),
});

const learnSchema = z.object({ items: z.array(z.object({ question: z.string().max(2000), answer: z.string().max(6000) })).max(25) });

export async function OPTIONS(req: Request) {
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return withExtension(req, async (uid) => {
    const db = await getDatabase();
    if (action === "lookup") {
      const url = new URL(req.url).searchParams.get("url") ?? "";
      const app = await db.withUser(uid, (tx) => tx.one("select id, company, role_title, status from applications where job_url = $1 limit 1", [url.slice(0, 2000)]));
      return { application: app, workspaceUrl: app ? `${appUrl()}/app/applications/${app.id}` : null };
    }
    if (action === "answers") {
      return db.withUser(uid, async (tx) => {
        const ctx = await getCareerContext(tx);
        const cp = await tx.one("select phone, linkedin_url, github_url, portfolio_url from career_profiles limit 1");
        const answers = await tx.query("select question, answer from approved_answers order by updated_at desc limit 50");
        // Suggestions only: the extension shows these for the user to copy; it never fills forms on its own.
        return {
          profile: {
            name: ctx.profile.fullName,
            email: ctx.profile.email,
            phone: cp?.phone ?? null,
            location: ctx.profile.location,
            linkedin: cp?.linkedin_url ?? null,
            github: cp?.github_url ?? null,
            portfolio: cp?.portfolio_url ?? null,
            totalExperienceYears: ctx.profile.yearsExperience,
            noticePeriodDays: ctx.profile.noticePeriodDays,
            currentCtcLpa: ctx.profile.currentCtcLpa,
            expectedCtc: ctx.profile.expectedCtcMinLpa ? `${ctx.profile.expectedCtcMinLpa}${ctx.profile.expectedCtcMaxLpa ? `–${ctx.profile.expectedCtcMaxLpa}` : ""} LPA` : null,
          },
          answers,
        };
      });
    }
    if (action === "autofill") return db.withUser(uid, (tx) => getAutofillData(tx));
    if (action === "resume") {
      const file = await db.withUser(uid, (tx) => getResumeFile(tx));
      if (!file) throw new Error("No resume uploaded yet. Upload one in CareerFlow → Resume.");
      return file;
    }
    if (action === "me") return { ok: true, appUrl: appUrl() };
    throw new Error("Unknown action");
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return withExtension(req, async (uid) => {
    const db = await getDatabase();
    const body = await req.json().catch(() => ({}));
    if (action === "save-job") {
      const j = saveSchema.parse(body);
      const r = await db.withUser(uid, (tx) =>
        createApplication(tx, uid, { company: j.company, roleTitle: j.roleTitle, jobUrl: j.url, jobDescription: j.description ?? null, jobPortal: j.portal ?? null, location: j.location ?? null, externalJobId: j.externalJobId ?? null, status: "saved" }, { source: "extension" }),
      );
      return { id: r.application.id, duplicate: !!r.duplicateOf, workspaceUrl: `${appUrl()}/app/applications/${r.application.id}` };
    }
    if (action === "mark-applied") {
      // Only called after the user clicks "I submitted this application" in the extension popup.
      const { id, confirmed } = z.object({ id: z.string().uuid(), confirmed: z.literal(true) }).parse(body);
      void confirmed;
      await db.withUser(uid, async (tx) => {
        await setStatusManually(tx, uid, id, "applied", "Marked as submitted from the Chrome extension");
        await recordEvent(tx, uid, { applicationId: id, type: "note_added", source: "extension", payload: { note: "Submission confirmed by you in the extension" } });
      });
      return { ok: true };
    }
    if (action === "draft-answer") {
      // Drafts an answer to an open question on an application form. The extension marks it for review.
      const d = draftSchema.parse(body);
      const r = await answerQuestion(db, uid, { question: d.question, charLimit: d.charLimit ?? null, length: "short", job: d.job ?? null });
      return { answer: r.answer, missingFacts: r.missingFacts, method: r.method };
    }
    if (action === "save-answers") {
      const { items } = learnSchema.parse(body);
      return db.withUser(uid, (tx) => saveLearnedAnswers(tx, uid, items));
    }
    if (action === "applied") {
      // Sent after the extension saw a submitted application form and its confirmation (or the user confirmed).
      const j = jobSchema.parse(body);
      const r = await db.withUser(uid, (tx) => markAppliedFromExtension(tx, uid, j));
      return { ...r, workspaceUrl: `${appUrl()}/app/applications/${r.id}` };
    }
    throw new Error("Unknown action");
  });
}
