import { ActionButton, ActionForm, CopyButton, SubmitButton } from "@/components/client";
import { CopilotForm, ScreenshotQuestions } from "@/components/forms";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { copilotAnswerAction, deleteAnswerAction, saveAnswerAction, screenshotQuestionsAction } from "../_actions/ai";

export const metadata = { title: "Application Copilot" };

const COMMON = ["Why should we hire you?", "Why are you interested in this role?", "Describe your experience.", "What is your current CTC?", "What is your expected CTC?", "What is your notice period?", "Describe your projects.", "Why are you changing jobs?", "What skills make you suitable?"];

export default async function Copilot({ searchParams }: { searchParams: Promise<{ application?: string; q?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    apps: await tx.query<{ id: string; company: string; role_title: string }>("select id, company, role_title from applications where not archived order by last_activity_at desc limit 100"),
    library: await tx.query("select a.*, ap.company from approved_answers a left join applications ap on ap.id = a.application_id order by a.updated_at desc"),
  }));
  const ai = !!process.env.GEMINI_API_KEY;
  return (
    <div className="space-y-6">
      <PageHeader title="Application Copilot" description="Draft answers to recruiter and application-form questions from your verified profile. Facts it does not know are listed as missing, never invented." />
      {!ai && <Notice tone="info">AI is not configured. Factual questions (current/expected CTC, notice period, experience, location) are still answered directly from your profile.</Notice>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Ask a question">
            <CopilotForm action={copilotAnswerAction} saveAction={saveAnswerAction} apps={d.apps.map((a) => ({ id: a.id, label: `${a.company} · ${a.role_title}` }))} defaultApp={sp.application} defaultQuestion={sp.q} />
          </Card>
          {ai && (
            <Card title="Questions from a screenshot" description="Upload a screenshot of an application form. Gemini reads the questions; you choose which to answer.">
              <ScreenshotQuestions action={screenshotQuestionsAction} />
            </Card>
          )}
        </div>
        <Card title="Common questions">
          <ul className="space-y-1">
            {COMMON.map((q) => (
              <li key={q}>
                <a href={`/app/copilot?q=${encodeURIComponent(q)}${sp.application ? `&application=${sp.application}` : ""}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  {q}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Approved answer library" description="Reused across applications and by the Chrome extension's autofill suggestions.">
        {d.library.length ? (
          <ul className="divide-y divide-line">
            {d.library.map((a: any) => (
              <li key={a.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer items-center gap-2 text-sm">
                    <span className="flex-1 font-medium">{a.question}</span>
                    {a.company && <span className="text-xs text-muted">{a.company}</span>}
                  </summary>
                  <ActionForm action={saveAnswerAction} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="question" defaultValue={a.question} className="input" aria-label="Question" />
                    <textarea name="answer" defaultValue={a.answer} rows={4} className="input" aria-label="Answer" />
                    <input name="tags" defaultValue={(a.tags ?? []).join(", ")} className="input" placeholder="Tags" aria-label="Tags" />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                      <CopyButton text={a.answer} />
                    </div>
                  </ActionForm>
                  <div className="mt-2">
                    <ActionButton action={deleteAnswerAction} fields={{ id: a.id }} className="btn btn-ghost btn-sm text-bad" confirm="Delete this answer?">
                      Delete
                    </ActionButton>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No saved answers yet">Save answers you are happy with so you can reuse them.</EmptyState>
        )}
      </Card>
    </div>
  );
}
