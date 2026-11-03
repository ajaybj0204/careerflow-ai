import Link from "next/link";
import { Inbox } from "lucide-react";
import { STATUS_LABEL } from "@careerflow/shared";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, EmptyState, fmtDate, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { lastReviewClear } from "@careerflow/core";
import { clearAllReviewsAction, resolveReviewAction, undoClearReviewsAction } from "../_actions/misc";

export const metadata = { title: "Needs Review" };

export default async function Review() {
  const d = await withUser(async (tx) => ({
    items: await tx.query(
      `select r.*, m.subject, m.from_email, m.from_name, m.snippet, m.internal_date, m.gmail_message_id, a.company as app_company, a.role_title as app_role
       from review_queue r left join processed_messages m on m.id = r.processed_message_id left join applications a on a.id = r.application_id
       where r.status = 'open' order by r.created_at desc`,
    ),
    apps: await tx.query("select id, company, role_title from applications where not archived order by last_activity_at desc limit 200"),
    lastClear: await lastReviewClear(tx),
  }));
  const n = d.items.length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Needs Review"
        description="CareerFlow only updates applications automatically when the evidence is clear. Everything uncertain waits here for you — nothing is marked rejected or selected on ambiguous evidence."
        actions={
          n > 0 ? (
            <ActionButton
              action={clearAllReviewsAction}
              className="btn btn-danger"
              pendingText="Clearing…"
              confirm={`Clear all ${n} item${n === 1 ? "" : "s"} from Needs Review? Nothing changes in your applications or Gmail. You can undo this for 24 hours.`}
            >
              Clear all ({n})
            </ActionButton>
          ) : null
        }
      />
      {d.lastClear && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-ink-2">
            You cleared {d.lastClear.n} items {fmtDate(d.lastClear.at, true)}.
          </span>
          <ActionButton action={undoClearReviewsAction} pendingText="Restoring…">
            Undo clear all
          </ActionButton>
        </div>
      )}
      {!d.items.length ? (
        <EmptyState icon={<Inbox className="size-6" />} title="All clear">
          Nothing needs your confirmation.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {d.items.map((r: any) => {
            const s = r.suggestion ?? {};
            return (
              <div key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.kind === "status_change" ? "warn" : "info"}>{r.kind === "status_change" ? "Status change" : r.kind === "new_application" ? "New application?" : "Which application?"}</Badge>
                  {s.category && <Badge>{s.category.replace(/_/g, " ")}</Badge>}
                  {r.confidence !== null && <span className="text-xs text-muted">confidence {Math.round(Number(r.confidence) * 100)}%</span>}
                  <span className="ml-auto text-xs text-muted">{fmtDate(r.internal_date ?? r.created_at, true)}</span>
                </div>
                {r.subject && (
                  <div className="mt-2 text-sm">
                    <p className="font-medium">{r.subject}</p>
                    <p className="text-ink-2">
                      {r.from_name ?? r.from_email} · {r.snippet}
                    </p>
                    {r.gmail_message_id && (
                      <a href={`https://mail.google.com/mail/u/0/#all/${r.gmail_message_id}`} target="_blank" rel="noopener noreferrer" className="link text-xs">
                        Open in Gmail
                      </a>
                    )}
                  </div>
                )}
                {r.kind === "status_change" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      <Link href={`/app/applications/${r.application_id}`} className="font-medium hover:text-accent">
                        {r.app_company} · {r.app_role}
                      </Link>
                      : {STATUS_LABEL[s.from as keyof typeof STATUS_LABEL] ?? s.from} → <span className="font-medium">{STATUS_LABEL[s.to as keyof typeof STATUS_LABEL] ?? s.to}</span>
                      {s.locked && <span className="text-xs text-muted"> (you set the current status)</span>}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <ActionButton action={resolveReviewAction} fields={{ id: r.id, decision: "accept" }} className="btn btn-primary btn-sm">
                        Apply change
                      </ActionButton>
                      <ActionButton action={resolveReviewAction} fields={{ id: r.id, decision: "reject" }}>
                        Keep current
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <ActionForm action={resolveReviewAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <div className="min-w-48 flex-1">
                        <label className="label" htmlFor={`app-${r.id}`}>
                          Link to application
                        </label>
                        <select id={`app-${r.id}`} name="applicationId" className="input" defaultValue={s.candidates?.[0]?.applicationId ?? ""} required>
                          <option value="" disabled>
                            Choose…
                          </option>
                          {d.apps.map((a: any) => {
                            const c = s.candidates?.find((x: any) => x.applicationId === a.id);
                            return (
                              <option key={a.id} value={a.id}>
                                {a.company} · {a.role_title}
                                {c ? ` (${Math.round(c.score * 100)}% match)` : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <SubmitButton className="btn btn-primary btn-sm">Link{s.suggestedStatus ? ` & set ${STATUS_LABEL[s.suggestedStatus as keyof typeof STATUS_LABEL]}` : ""}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveReviewAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <input name="newCompany" className="input min-w-32 flex-1" placeholder="Company" defaultValue={s.company ?? ""} required aria-label="Company" />
                      <input name="newRole" className="input min-w-32 flex-1" placeholder="Role" defaultValue={s.jobTitle ?? ""} required aria-label="Role" />
                      <SubmitButton className="btn btn-secondary btn-sm">Create new application</SubmitButton>
                    </ActionForm>
                    <div className="lg:col-span-2">
                      <ActionButton action={resolveReviewAction} fields={{ id: r.id, decision: "dismiss" }} className="btn btn-ghost btn-sm">
                        Not job-related / ignore
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
