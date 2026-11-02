import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ShieldAlert, Sparkles } from "lucide-react";
import { readDocxParagraphs } from "@careerflow/document-engine";
import { templateFor, type MasterResumeRow, type TailorChange } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { markSubmittedAction } from "../../../_actions/applications";
import { decideChangeAction, manualEditAction, renderTailoredAction, suggestTailoringAction } from "../../../_actions/documents";

export const metadata = { title: "Tailor resume" };

const ROLE_LABEL: Record<string, string> = { summary: "Summary", bullet: "Bullet", skills: "Skills", body: "Text", heading: "Heading", contact: "Contact", role_header: "Role / dates", empty: "" };

export default async function TailorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await withUser(async (tx) => {
    const t = await tx.one("select * from tailored_resumes where id = $1", [id]);
    if (!t) return null;
    const mr = await tx.one<MasterResumeRow>("select * from master_resumes where id = $1", [t.master_resume_id]);
    const paras = await readDocxParagraphs(await templateFor(tx, mr!));
    const app = t.application_id ? await tx.one("select id, company, role_title, job_description from applications where id = $1", [t.application_id]) : null;
    const report = t.job_match_report_id ? await tx.one("select * from job_match_reports where id = $1", [t.job_match_report_id]) : null;
    return { t, mr: mr!, paras, app, report };
  });
  if (!d) notFound();
  const changes: TailorChange[] = d.t.changes ?? [];
  const byIndex = new Map(changes.map((c) => [c.paragraphIndex, c]));
  const v = d.t.validation ?? {};
  const ai = !!process.env.GEMINI_API_KEY;
  const accepted = changes.filter((c) => c.decision === "accepted" || c.decision === "edited").length;
  const report = d.report?.match;
  return (
    <div className="space-y-6">
      <PageHeader
        title={d.app ? `Tailor for ${d.app.company}` : "Tailor resume"}
        description={d.app ? `${d.app.role_title} · from "${d.mr.label}"` : `From "${d.mr.label}"`}
        actions={
          <>
            {d.app && (
              <Link href={`/app/applications/${d.app.id}`} className="btn btn-secondary">
                Open workspace
              </Link>
            )}
            {ai && d.app?.job_description && (
              <ActionButton action={suggestTailoringAction} fields={{ id }} className="btn btn-secondary" pendingText="Thinking…">
                <Sparkles className="size-4" /> Get AI suggestions
              </ActionButton>
            )}
            <ActionButton action={renderTailoredAction} fields={{ id }} className="btn btn-primary" pendingText="Building documents…">
              Create DOCX & PDF ({accepted} change{accepted === 1 ? "" : "s"})
            </ActionButton>
          </>
        }
      />

      {report && (
        <Card title={`Job match: ${report.label} · ${report.score}/100`} description={report.disclaimer}>
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="font-medium text-good">Matched skills</p>
              <p className="text-ink-2">{report.matchedSkills.join(", ") || "None yet"}</p>
            </div>
            <div>
              <p className="font-medium text-warn">Not in your verified profile</p>
              <p className="text-ink-2">{report.missingSkills.join(", ") || "None"}</p>
              {report.unconfirmedSkills.length > 0 && (
                <p className="mt-1 text-xs">
                  Unconfirmed in your profile: {report.unconfirmedSkills.join(", ")} — <Link href="/app/profile#verified_skills" className="link">confirm if accurate</Link>
                </p>
              )}
            </div>
            <ul className="space-y-1 text-ink-2">
              {report.reasons.slice(1).map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {d.t.docx_document_id && (
        <Card title="Generated documents" description={v.checkedAt ? `Built from ${v.appliedEdits} change(s).` : undefined}>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/documents/${d.t.docx_document_id}`} className="btn btn-primary">
              Download DOCX (exact template)
            </a>
            <a href={`/api/documents/${d.t.pdf_document_id}`} className="btn btn-secondary">
              Download PDF{v.pdfMode === "simplified" ? " (simplified layout)" : ""}
            </a>
            {d.t.pdf_document_id && (
              <a href={`/api/documents/${d.t.pdf_document_id}?inline=1`} target="_blank" rel="noopener" className="btn btn-ghost">
                Preview PDF
              </a>
            )}
            {d.app && d.t.status !== "submitted" && (
              <ActionButton action={markSubmittedAction} fields={{ applicationId: d.app.id, tailoredId: id }} className="btn btn-secondary">
                I submitted this version
              </ActionButton>
            )}
            {d.t.status === "submitted" && <Badge tone="good">Recorded as submitted</Badge>}
          </div>
          {v.warnings?.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {v.warnings.map((w: string, i: number) => (
                <li key={i} className="rounded-lg bg-warn-soft px-3 py-2 text-warn">
                  {w}
                </li>
              ))}
            </ul>
          )}
          {v.pages?.tailored != null && (
            <p className="mt-2 text-sm text-ink-2">
              Page check: original {v.pages.original} page(s), tailored {v.pages.tailored} page(s).
            </p>
          )}
        </Card>
      )}

      <Notice tone="info">
        Locked paragraphs (your name, contact line, employers, job titles, dates and education) cannot be changed here. Suggestions that add skills, numbers or organisations not in your verified profile are blocked automatically.
      </Notice>

      <div className="space-y-2">
        {d.paras.map((p) => {
          if (!p.text.trim()) return null;
          const c = byIndex.get(p.index);
          if (!p.editable)
            return (
              <div key={p.index} className={`flex items-start gap-2 px-3 py-1.5 text-sm text-muted ${p.role === "heading" ? "mt-4 font-semibold text-ink-2 uppercase" : ""}`}>
                <Lock className="mt-0.5 size-3 shrink-0" aria-label="Locked" />
                <span>{p.text}</span>
              </div>
            );
          return (
            <div key={p.index} className={`card p-3 ${c?.decision === "blocked" ? "border-bad/40" : c && c.decision !== "rejected" ? "border-accent/40" : ""}`}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge>{ROLE_LABEL[p.role] ?? p.role}</Badge>
                {c && (
                  <Badge tone={c.decision === "blocked" ? "bad" : c.decision === "rejected" ? "neutral" : c.decision === "pending" ? "warn" : "good"}>
                    {c.author === "user" ? "Your edit" : c.decision === "pending" ? "AI suggestion" : c.decision}
                  </Badge>
                )}
              </div>
              {c && c.decision !== "rejected" && c.author === "ai" ? (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Original</p>
                    <p className="text-ink-2">{c.original}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted">Suggested</p>
                    <p>{c.final ?? c.proposed}</p>
                    <p className="mt-1 text-xs text-ink-2">Why: {c.reason}</p>
                    {c.issues.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {c.issues.map((i, k) => (
                          <li key={k} className="flex gap-1.5 text-xs text-bad">
                            <ShieldAlert className="size-3.5 shrink-0" /> {i.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.decision !== "accepted" && c.decision !== "blocked" && (
                        <ActionButton action={decideChangeAction} fields={{ id, changeId: c.id, decision: "accepted" }} className="btn btn-primary btn-sm">
                          Accept
                        </ActionButton>
                      )}
                      <ActionButton action={decideChangeAction} fields={{ id, changeId: c.id, decision: "rejected" }} className="btn btn-secondary btn-sm">
                        {c.decision === "accepted" ? "Undo" : "Reject"}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm">{c?.decision === "edited" ? c.final : p.text}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent">Edit this paragraph yourself</summary>
                <ActionForm action={manualEditAction} className="mt-2 space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="paragraphIndex" value={p.index} />
                  <textarea name="text" rows={3} className="input" defaultValue={c?.final ?? c?.proposed ?? p.text} />
                  <p className="text-xs text-muted">Keep it about the same length to avoid pushing content onto another page. Clear the box to restore the original.</p>
                  <SubmitButton className="btn btn-secondary btn-sm">Save edit</SubmitButton>
                </ActionForm>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
