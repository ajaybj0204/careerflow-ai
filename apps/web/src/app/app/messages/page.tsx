import { OUTREACH_KINDS, gmailComposeUrl } from "@careerflow/core";
import { ActionButton, CopyButton } from "@/components/client";
import { ResultPanel } from "@/components/forms";
import { Badge, Card, EmptyState, fmtDate, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { deleteDraftAction, outreachAction, updateDraftAction } from "../_actions/ai";

export const metadata = { title: "Recruiter Messages" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ kind?: string; application?: string; recruiter?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    apps: await tx.query("select id, company, role_title from applications where not archived order by last_activity_at desc limit 100"),
    recs: await tx.query("select id, name, company, email from recruiter_contacts order by name"),
    drafts: await tx.query(
      "select d.*, a.company, a.role_title, r.email as to_email, r.name as to_name from outreach_drafts d left join applications a on a.id = d.application_id left join recruiter_contacts r on r.id = d.recruiter_id order by d.updated_at desc limit 30",
    ),
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="Recruiter Messages" description="Referral requests, follow-ups, thank-you notes, negotiation and offer replies drafted from the real application. You review and send every message yourself — nothing is sent automatically." />
      <Card title="Draft a message">
        <ResultPanel action={outreachAction} kind="outreach" submitLabel="Draft message" pendingText="Drafting…">
          <div className="grid gap-3 sm:grid-cols-3">
            <select name="kind" className="input" defaultValue={sp.kind ?? "follow_up"} aria-label="Message type">
              {Object.entries(OUTREACH_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select name="applicationId" className="input" defaultValue={sp.application ?? ""} aria-label="Application">
              <option value="">No application</option>
              {d.apps.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.company} · {a.role_title}
                </option>
              ))}
            </select>
            <select name="recruiterId" className="input" defaultValue={sp.recruiter ?? ""} aria-label="Recipient">
              <option value="">No recipient</option>
              {d.recs.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name ?? r.email} {r.company ? `(${r.company})` : ""}
                </option>
              ))}
            </select>
          </div>
          <input name="notes" className="input" placeholder="Anything specific to mention (optional)" />
        </ResultPanel>
      </Card>
      <Card title="Drafts">
        {d.drafts.length ? (
          <ul className="divide-y divide-line">
            {d.drafts.map((m: any) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{OUTREACH_KINDS[m.kind] ?? m.kind}</span>
                  {m.company && <span className="text-ink-2">· {m.company}</span>}
                  {m.to_name && <span className="text-ink-2">· to {m.to_name}</span>}
                  <Badge tone={m.status === "sent_by_user" ? "good" : "neutral"}>{m.status === "sent_by_user" ? "sent by you" : "draft"}</Badge>
                  <span className="ml-auto text-xs text-muted">{fmtDate(m.updated_at, true)}</span>
                </div>
                {m.subject && <p className="mt-1 text-sm">Subject: {m.subject}</p>}
                <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-2">{m.body}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <CopyButton text={m.subject ? `Subject: ${m.subject}\n\n${m.body}` : m.body} />
                  <a href={gmailComposeUrl(m.to_email, m.subject, m.body)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    Open in Gmail
                  </a>
                  {m.status !== "sent_by_user" && (
                    <ActionButton action={updateDraftAction} fields={{ id: m.id, status: "sent_by_user" }} className="btn btn-ghost btn-sm">
                      I sent it
                    </ActionButton>
                  )}
                  <ActionButton action={deleteDraftAction} fields={{ id: m.id }} className="btn btn-ghost btn-sm text-bad">
                    Delete
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No drafts yet" />
        )}
      </Card>
    </div>
  );
}
