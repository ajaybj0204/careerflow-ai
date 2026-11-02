import Link from "next/link";
import { Contact } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, fmtDate, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { recruiterAction } from "../_actions/misc";

export const metadata = { title: "Recruiter CRM" };

function RecruiterFields({ r }: { r?: any }) {
  return (
    <>
      <input name="name" defaultValue={r?.name ?? ""} className="input" placeholder="Name" />
      <input name="company" defaultValue={r?.company ?? ""} className="input" placeholder="Company" />
      <input name="email" type="email" defaultValue={r?.email ?? ""} className="input" placeholder="Work email" />
      <input name="phone" defaultValue={r?.phone ?? ""} className="input" placeholder="Phone" />
      <input name="title" defaultValue={r?.title ?? ""} className="input" placeholder="Title" />
      <input name="linkedinUrl" defaultValue={r?.linkedin_url ?? ""} className="input" placeholder="LinkedIn URL" />
      <input name="nextFollowupAt" type="date" defaultValue={r?.next_followup_at ? new Date(r.next_followup_at).toISOString().slice(0, 10) : ""} className="input" aria-label="Next follow-up" />
      <textarea name="notes" defaultValue={r?.notes ?? ""} className="input sm:col-span-2" rows={2} placeholder="Notes" />
    </>
  );
}

export default async function Recruiters() {
  const rows = await withUser((tx) =>
    tx.query(
      `select r.*, coalesce(json_agg(json_build_object('id', a.id, 'company', a.company, 'role', a.role_title)) filter (where a.id is not null), '[]') as apps
       from recruiter_contacts r left join applications a on a.recruiter_id = r.id group by r.id order by r.next_followup_at nulls last, r.updated_at desc`,
    ),
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Recruiter CRM" description="Contacts you have legitimately been in touch with for recruitment, their applications, follow-up dates and notes. Recruiters from Gmail are added automatically." />
      <Card title="Add a recruiter">
        <ActionForm action={recruiterAction} resetOnSuccess className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="op" value="create" />
          <RecruiterFields />
          <div>
            <SubmitButton>Add</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r: any) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.name ?? r.email ?? "Unnamed"}</p>
                {r.source === "gmail" && <Badge tone="info">from Gmail</Badge>}
                {r.next_followup_at && <Badge tone={new Date(r.next_followup_at) < new Date() ? "warn" : "neutral"}>follow up {fmtDate(r.next_followup_at)}</Badge>}
              </div>
              <p className="text-sm text-ink-2">
                {[r.title, r.company].filter(Boolean).join(" · ")}
                {r.email && <span className="block">{r.email}</span>}
              </p>
              {r.apps.length > 0 && (
                <ul className="mt-2 text-sm">
                  {r.apps.map((a: any) => (
                    <li key={a.id}>
                      <Link href={`/app/applications/${a.id}`} className="hover:text-accent">
                        {a.company} · {a.role}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {r.notes && <p className="mt-2 text-sm text-ink-2">{r.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href={`/app/messages?recruiter=${r.id}${r.apps[0] ? `&application=${r.apps[0].id}` : ""}`} className="btn btn-secondary btn-sm">
                  Draft message
                </Link>
                <details>
                  <summary className="btn btn-ghost btn-sm list-none">Edit</summary>
                  <ActionForm action={recruiterAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="op" value="update" />
                    <input type="hidden" name="id" value={r.id} />
                    <RecruiterFields r={r} />
                    <SubmitButton className="btn btn-primary btn-sm">Save</SubmitButton>
                  </ActionForm>
                </details>
                <ActionButton action={recruiterAction} fields={{ op: "delete", id: r.id }} className="btn btn-ghost btn-sm text-bad" confirm="Delete this contact?">
                  Delete
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Contact className="size-6" />} title="No recruiters yet" />
      )}
    </div>
  );
}
