import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Lock, Mail, Unlock } from "lucide-react";
import { APPLICATION_STATUSES, EVENT_LABEL, STATUS_LABEL, type EventType } from "@careerflow/shared";
import { getWorkspace } from "@careerflow/core";
import { ActionButton, ActionForm, CopyButton, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, Field, fmtDate, MethodTag, Notice, PageHeader, StatusBadge, Tabs, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";
import {
  addAssessmentAction,
  addInterviewAction,
  addNoteAction,
  addTaskAction,
  completeAssessmentAction,
  deleteApplicationAction,
  linkRecruiterAction,
  setStatusAction,
  toggleTaskAction,
  unlockStatusAction,
  updateApplicationAction,
  updateInterviewAction,
} from "../../_actions/applications";
import { matchReportAction, packageAction } from "../../_actions/documents";
import { saveAnswerAction } from "../../_actions/ai";

export const metadata = { title: "Workspace" };

const TABS = ["overview", "jd", "documents", "questions", "communication", "prep", "timeline", "analytics"] as const;

export default async function Workspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; duplicate?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "overview";
  const data = await withUser(async (tx) => {
    const w = await getWorkspace(tx, id);
    if (!w) return null;
    const recruiters = await tx.query("select id, name, company, email from recruiter_contacts order by name");
    return { ...w, recruiters };
  });
  if (!data) notFound();
  const { app } = data;
  const report = data.reports[0];
  return (
    <div>
      <PageHeader
        title={app.company}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {app.role_title}
            {app.location && <span className="text-muted">· {app.location}</span>}
            <StatusBadge status={app.status} />
            {app.status_locked && (
              <Badge title="You set this status. Automation will ask before applying outcomes.">
                <Lock className="size-3" /> set by you
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                Job posting <ExternalLink className="size-3.5" />
              </a>
            )}
            <Link href={`/app/resume?application=${app.id}`} className="btn btn-secondary">
              Tailor resume
            </Link>
            <ActionForm action={setStatusAction} className="flex gap-1.5">
              <input type="hidden" name="id" value={app.id} />
              <select name="status" defaultValue={app.status} className="input w-auto" aria-label="Status">
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn btn-primary">Update</SubmitButton>
            </ActionForm>
          </>
        }
      />
      {sp.duplicate && (
        <div className="mb-4">
          <Notice tone="warn" title="Possible duplicate">
            A matching application already existed, so CareerFlow opened it instead of creating a second record. Tick "Save even if it looks like a duplicate" when adding if this is genuinely a different role.
          </Notice>
        </div>
      )}
      <Tabs
        base={`/app/applications/${app.id}`}
        active={tab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "jd", label: "Job description" },
          { id: "documents", label: "Documents", count: data.documents.length },
          { id: "questions", label: "Questions", count: data.answers.length },
          { id: "communication", label: "Communication", count: data.emails.length },
          { id: "prep", label: "Interview prep", count: data.interviews.length },
          { id: "timeline", label: "Timeline", count: data.events.length },
          { id: "analytics", label: "Analytics" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Details">
              <ActionForm action={updateApplicationAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={app.id} />
                <Field label="Company" htmlFor="company">
                  <input id="company" name="company" defaultValue={app.company} className="input" required />
                </Field>
                <Field label="Role" htmlFor="roleTitle">
                  <input id="roleTitle" name="roleTitle" defaultValue={app.role_title} className="input" required />
                </Field>
                <Field label="Location" htmlFor="location">
                  <input id="location" name="location" defaultValue={app.location ?? ""} className="input" />
                </Field>
                <Field label="Job portal" htmlFor="jobPortal">
                  <input id="jobPortal" name="jobPortal" defaultValue={app.job_portal ?? ""} className="input" />
                </Field>
                <Field label="Job URL" htmlFor="jobUrl">
                  <input id="jobUrl" name="jobUrl" defaultValue={app.job_url ?? ""} className="input" />
                </Field>
                <Field label="Job ID" htmlFor="externalJobId">
                  <input id="externalJobId" name="externalJobId" defaultValue={app.external_job_id ?? ""} className="input" />
                </Field>
                <Field label="Applied on (known submission time)" htmlFor="appliedAt">
                  <input id="appliedAt" name="appliedAt" type="datetime-local" defaultValue={app.applied_at ? new Date(app.applied_at).toISOString().slice(0, 16) : ""} className="input" />
                </Field>
                <Field label="Salary" htmlFor="salaryText">
                  <input id="salaryText" name="salaryText" defaultValue={app.salary_text ?? ""} className="input" />
                </Field>
                <Field label="Next action" htmlFor="nextAction">
                  <input id="nextAction" name="nextAction" defaultValue={app.next_action ?? ""} className="input" />
                </Field>
                <Field label="Next action due" htmlFor="nextActionDue">
                  <input id="nextActionDue" name="nextActionDue" type="date" defaultValue={app.next_action_due ? new Date(app.next_action_due).toISOString().slice(0, 10) : ""} className="input" />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton>Save details</SubmitButton>
                </div>
              </ActionForm>
            </Card>
            <Card title="Notes">
              {app.notes && <p className="mb-3 text-sm whitespace-pre-line text-ink-2">{app.notes}</p>}
              <ActionForm action={addNoteAction} resetOnSuccess className="flex gap-2">
                <input type="hidden" name="id" value={app.id} />
                <input name="note" className="input" placeholder="Add a note" aria-label="New note" />
                <SubmitButton className="btn btn-secondary">Add</SubmitButton>
              </ActionForm>
            </Card>
            <Card title="Tasks">
              <ul className="mb-3 space-y-1.5">
                {data.tasks.map((t: any) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <ActionButton action={toggleTaskAction} fields={{ id: t.id }} className="btn btn-ghost btn-sm">
                      {t.done_at ? "☑" : "☐"}
                    </ActionButton>
                    <span className={t.done_at ? "text-muted line-through" : ""}>{t.title}</span>
                    {t.due_at && <span className="text-xs text-muted">{fmtDate(t.due_at)}</span>}
                  </li>
                ))}
              </ul>
              <ActionForm action={addTaskAction} resetOnSuccess className="flex flex-wrap gap-2">
                <input type="hidden" name="applicationId" value={app.id} />
                <input name="title" className="input flex-1" placeholder="New task" aria-label="Task" />
                <input name="dueAt" type="date" className="input w-auto" aria-label="Due" />
                <SubmitButton className="btn btn-secondary">Add task</SubmitButton>
              </ActionForm>
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="Key dates">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">Added</dt>
                  <dd>{fmtDate(app.created_at)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">Applied (known)</dt>
                  <dd>{fmtDate(app.applied_at, true)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">Confirmation email</dt>
                  <dd>{fmtDate(app.confirmation_received_at, true)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-2">Last activity</dt>
                  <dd>{timeAgo(app.last_activity_at)}</dd>
                </div>
              </dl>
              {app.status_locked && (
                <div className="mt-3 border-t border-line pt-3">
                  <ActionButton action={unlockStatusAction} fields={{ id: app.id }} className="btn btn-ghost btn-sm">
                    <Unlock className="size-3.5" /> Let automation update status
                  </ActionButton>
                </div>
              )}
            </Card>
            <Card title="Recruiter">
              {data.recruiter ? (
                <div className="text-sm">
                  <p className="font-medium">{data.recruiter.name ?? data.recruiter.email}</p>
                  {data.recruiter.email && <p className="text-ink-2">{data.recruiter.email}</p>}
                  <Link href={`/app/messages?application=${app.id}&recruiter=${data.recruiter.id}`} className="btn btn-secondary btn-sm mt-2">
                    Draft a message
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-ink-2">No recruiter linked.</p>
              )}
              <ActionForm action={linkRecruiterAction} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={app.id} />
                <select name="recruiterId" defaultValue={app.recruiter_id ?? ""} className="input" aria-label="Recruiter">
                  <option value="">None</option>
                  {data.recruiters.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name ?? r.email} {r.company ? `(${r.company})` : ""}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn btn-secondary btn-sm">Link</SubmitButton>
              </ActionForm>
            </Card>
            {report && (
              <Card title="Job match">
                <p className="text-sm">
                  <span className="font-medium">{report.match.label}</span> · {report.score}/100
                </p>
                <p className="mt-1 text-xs text-muted">{report.match.disclaimer}</p>
              </Card>
            )}
            <Card title="Danger zone">
              <ActionButton action={deleteApplicationAction} fields={{ id: app.id }} className="btn btn-danger btn-sm" confirm="Delete this application and its timeline? Linked documents stay in your vault.">
                Delete application
              </ActionButton>
            </Card>
          </div>
        </div>
      )}

      {tab === "jd" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Job description" className="lg:col-span-2">
            <ActionForm action={matchReportAction} className="space-y-3">
              <input type="hidden" name="applicationId" value={app.id} />
              <textarea name="jobDescription" rows={18} className="input font-mono text-[13px]" defaultValue={app.job_description ?? ""} placeholder="Paste the job description" aria-label="Job description" />
              <SubmitButton pendingText="Analysing…">Save and analyse</SubmitButton>
            </ActionForm>
          </Card>
          <div className="space-y-6">
            {report ? (
              <Card title={`${report.match.label} · ${report.score}/100`} description={report.match.disclaimer} actions={<MethodTag method={report.method} />}>
                <ul className="space-y-1.5 text-sm text-ink-2">
                  {report.match.reasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {report.match.suggestions.length > 0 && (
                  <>
                    <p className="mt-3 text-sm font-medium">Suggestions</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">
                      {report.match.suggestions.map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="text-muted">Experience:</span> {report.analysis.experienceMinYears ?? "?"}
                    {report.analysis.experienceMaxYears ? `–${report.analysis.experienceMaxYears}` : "+"} yrs · <span className="text-muted">Seniority:</span> {report.analysis.seniority ?? "?"}
                  </p>
                  <p>
                    <span className="text-muted">Tools:</span> {report.analysis.tools?.join(", ") || "—"}
                  </p>
                  {report.analysis.salary && (
                    <p>
                      <span className="text-muted">Salary:</span> {report.analysis.salary}
                    </p>
                  )}
                </div>
              </Card>
            ) : (
              <Card title="Match report">
                <p className="text-sm text-ink-2">Paste the job description and analyse it to compare against your verified profile.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
          <Card
            title="Application package"
            description="Resume, cover letter and job match report bundled as a ZIP. Generating documents never marks the job as applied."
            actions={
              <ActionButton action={packageAction} fields={{ applicationId: app.id }} className="btn btn-primary btn-sm" pendingText="Packaging…">
                Build ZIP package
              </ActionButton>
            }
          >
            <div className="flex flex-wrap gap-2">
              <Link href={`/app/resume?application=${app.id}`} className="btn btn-secondary btn-sm">
                Tailor a resume
              </Link>
              <Link href={`/app/cover-letters?application=${app.id}`} className="btn btn-secondary btn-sm">
                Write a cover letter
              </Link>
            </div>
          </Card>
          <Card title="Tailored resumes">
            {data.tailored.length ? (
              <ul className="divide-y divide-line text-sm">
                {data.tailored.map((t: any) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1">Version from {fmtDate(t.updated_at, true)}</span>
                    {app.resume_version_id === t.id && <Badge tone="good">Submitted version</Badge>}
                    <Badge>{t.status}</Badge>
                    <Link href={`/app/resume/tailor/${t.id}`} className="btn btn-secondary btn-sm">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">None yet.</p>
            )}
          </Card>
          <Card title="Files">
            {data.documents.length ? (
              <ul className="divide-y divide-line text-sm">
                {data.documents.map((d: any) => (
                  <li key={d.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">{d.title}</span>
                    <span className="text-xs text-muted">{fmtDate(d.created_at)}</span>
                    <a href={`/api/documents/${d.id}`} className="btn btn-secondary btn-sm">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Generated files for this job appear here.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "questions" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Saved answers for this application">
            {data.answers.length ? (
              <ul className="space-y-4">
                {data.answers.map((a: any) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-medium">{a.question}</p>
                    <p className="mt-1 whitespace-pre-line text-ink-2">{a.answer}</p>
                    <div className="mt-1.5">
                      <CopyButton text={a.answer} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Recruiter questions and approved answers for this job will appear here.</p>
            )}
          </Card>
          <Card title="Add a question and your answer" actions={<Link href={`/app/copilot?application=${app.id}`} className="btn btn-secondary btn-sm">Ask the Copilot</Link>}>
            <ActionForm action={saveAnswerAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="applicationId" value={app.id} />
              <input name="question" className="input" placeholder="Question" required aria-label="Question" />
              <textarea name="answer" rows={5} className="input" placeholder="Your answer" required aria-label="Answer" />
              <SubmitButton>Save answer</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "communication" && (
        <Card title="Linked emails" description="Only minimal metadata is stored (sender, subject, date, short snippet). Open Gmail for the full message.">
          {data.emails.length ? (
            <ul className="divide-y divide-line">
              {data.emails.map((e: any) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail className="size-4 text-muted" />
                    <span className="font-medium">{e.subject ?? "(no subject)"}</span>
                    {e.category && <Badge tone="info">{e.category.replace(/_/g, " ")}</Badge>}
                    {e.confirmed_by_user ? <Badge tone="good">confirmed by you</Badge> : <Badge>match {Math.round(Number(e.match_confidence) * 100)}%</Badge>}
                    <span className="ml-auto text-xs text-muted">{fmtDate(e.internal_date, true)}</span>
                  </div>
                  <p className="mt-1 text-ink-2">
                    {e.from_name ?? e.from_email} · {e.snippet}
                  </p>
                  <a href={`https://mail.google.com/mail/u/0/#all/${e.gmail_message_id}`} target="_blank" rel="noopener noreferrer" className="link text-xs">
                    Open in Gmail
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No linked emails">
              <Link href="/app/settings#gmail" className="link">
                Connect Gmail
              </Link>{" "}
              to link recruiter emails automatically.
            </EmptyState>
          )}
        </Card>
      )}

      {tab === "prep" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Interviews" actions={<Link href={`/app/interview?application=${app.id}`} className="btn btn-primary btn-sm">Interview Tomorrow mode</Link>}>
            <ul className="mb-4 space-y-2">
              {data.interviews.map((i: any) => (
                <li key={i.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium capitalize">{i.round_type} round</span>
                    <Badge tone={i.status === "completed" ? "good" : i.status === "cancelled" ? "neutral" : "progress"}>{i.status}</Badge>
                    {i.source === "gmail" && <Badge>from Gmail</Badge>}
                  </div>
                  <p className="text-ink-2">
                    {i.scheduled_at ? fmtDate(i.scheduled_at, true) : "Time not set"} {i.mode && i.mode !== "unknown" ? `· ${i.mode}` : ""}
                  </p>
                  {i.location_or_link && (
                    <a href={i.location_or_link} target="_blank" rel="noopener noreferrer" className="link text-xs break-all">
                      {i.location_or_link}
                    </a>
                  )}
                  {i.notes && <p className="text-xs text-muted">{i.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.status !== "completed" && (
                      <ActionButton action={updateInterviewAction} fields={{ id: i.id, status: "completed" }} className="btn btn-secondary btn-sm">
                        Mark completed
                      </ActionButton>
                    )}
                    <Link href={`/app/interview?application=${app.id}&review=${i.id}#review`} className="btn btn-ghost btn-sm">
                      Post-interview review
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <details>
              <summary className="btn btn-secondary btn-sm cursor-pointer">Add interview</summary>
              <ActionForm action={addInterviewAction} resetOnSuccess className="mt-3 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="applicationId" value={app.id} />
                <select name="roundType" className="input" aria-label="Round">
                  {["hr", "technical", "managerial", "behavioral", "case", "panel", "final", "other"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input name="scheduledAt" type="datetime-local" className="input" aria-label="When" />
                <select name="mode" className="input" aria-label="Mode">
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                  <option value="onsite">On-site</option>
                </select>
                <input name="link" className="input" placeholder="Meeting link or venue" />
                <input name="interviewer" className="input" placeholder="Interviewer" />
                <input name="duration" type="number" className="input" placeholder="Minutes" />
                <div className="sm:col-span-2">
                  <SubmitButton className="btn btn-primary btn-sm">Add interview</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </Card>
          <div className="space-y-6">
            <Card title="Assessments">
              <ul className="mb-3 space-y-2 text-sm">
                {data.assessments.map((a: any) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="flex-1">
                      {a.title}
                      {a.deadline && <span className="block text-xs text-muted">Due {fmtDate(a.deadline, true)}</span>}
                    </span>
                    <Badge tone={a.status === "completed" ? "good" : a.status === "expired" ? "bad" : "warn"}>{a.status}</Badge>
                    {a.link && (
                      <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                        Open
                      </a>
                    )}
                    {a.status === "pending" && (
                      <ActionButton action={completeAssessmentAction} fields={{ id: a.id }}>
                        Done
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
              <details>
                <summary className="btn btn-secondary btn-sm cursor-pointer">Add assessment</summary>
                <ActionForm action={addAssessmentAction} resetOnSuccess className="mt-3 grid gap-2">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input name="title" className="input" placeholder="Title" required />
                  <input name="link" className="input" placeholder="Link" />
                  <input name="deadline" type="datetime-local" className="input" aria-label="Deadline" />
                  <SubmitButton className="btn btn-primary btn-sm">Add</SubmitButton>
                </ActionForm>
              </details>
            </Card>
            <Card title="Practice">
              <div className="flex flex-wrap gap-2">
                <Link href={`/app/interview?application=${app.id}&mock=company`} className="btn btn-secondary btn-sm">
                  Company mock interview
                </Link>
                <Link href={`/app/interview?application=${app.id}&mock=resume`} className="btn btn-secondary btn-sm">
                  Resume-based mock
                </Link>
                <Link href="/app/scenarios" className="btn btn-secondary btn-sm">
                  Scenario Lab
                </Link>
              </div>
              {data.mocks.length > 0 && <p className="mt-3 text-sm text-ink-2">{data.mocks.length} mock interview(s) done for this job.</p>}
              {data.reviews.length > 0 && <p className="text-sm text-ink-2">{data.reviews.length} post-interview review(s) saved.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <Card title="Timeline" description="Every event for this application. The log cannot be edited.">
          <ol className="relative space-y-4 border-l border-line pl-5">
            {data.events.map((e: any) => (
              <li key={e.id} className="relative text-sm">
                <span className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${e.source === "gmail" ? "bg-info" : e.source === "manual" ? "bg-accent" : "bg-muted"}`} />
                <p>
                  <span className="font-medium">{EVENT_LABEL[e.type as EventType] ?? e.type}</span>
                  {e.type === "status_changed" && e.payload?.to && (
                    <span className="text-ink-2">
                      {" "}
                      → {STATUS_LABEL[e.payload.to as keyof typeof STATUS_LABEL]}
                      {e.payload.confidence ? ` (${Math.round(e.payload.confidence * 100)}% confidence)` : ""}
                    </span>
                  )}
                  {e.payload?.subject && <span className="text-ink-2"> · {e.payload.subject}</span>}
                  {e.payload?.note && <span className="text-ink-2"> · {e.payload.note}</span>}
                </p>
                <p className="text-xs text-muted">
                  {fmtDate(e.occurred_at, true)} · {e.source}
                </p>
              </li>
            ))}
          </ol>
          <h3 className="mt-6 mb-2 text-sm font-semibold">Status history</h3>
          <ul className="space-y-1 text-sm">
            {data.history.map((h: any) => (
              <li key={h.id} className="text-ink-2">
                {fmtDate(h.created_at, true)}: {h.from_status ? STATUS_LABEL[h.from_status as keyof typeof STATUS_LABEL] : "—"} → <span className="text-ink">{STATUS_LABEL[h.to_status as keyof typeof STATUS_LABEL]}</span> · {h.source}
                {h.reason ? ` · ${h.reason}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "analytics" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Days since added", Math.floor((Date.now() - new Date(app.created_at).getTime()) / 864e5)],
            ["Events", data.events.length],
            ["Emails linked", data.emails.length],
            ["Interviews", data.interviews.length],
            ["Assessments", data.assessments.length],
            ["Resume versions", data.tailored.length],
            ["Mock interviews", data.mocks.length],
            ["Match score", report ? `${report.score}/100` : "—"],
          ].map(([l, v]) => (
            <div key={String(l)} className="card p-4">
              <p className="text-xs text-muted">{l}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
