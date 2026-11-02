import Link from "next/link";
import { Briefcase, Download, Lock, Mail, Plus } from "lucide-react";
import { APPLICATION_STATUSES, STATUS_LABEL } from "@careerflow/shared";
import { listApplications } from "@careerflow/core";
import { ActionForm, SelectAll, SubmitButton } from "@/components/client";
import { EmptyState, fmtDate, PageHeader, StatusBadge, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";
import { bulkAction } from "../_actions/applications";

export const metadata = { title: "Applications" };

type SP = { q?: string; status?: string; portal?: string; sort?: string; from?: string; to?: string; archived?: string; view?: string };

export default async function Applications({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { apps, portals } = await withUser(async (tx) => ({
    apps: await listApplications(tx, { q: sp.q, status: sp.status, portal: sp.portal, sort: sp.sort as any, from: sp.from, to: sp.to, archived: sp.archived === "1" }),
    portals: (await tx.query<{ job_portal: string }>("select distinct job_portal from applications where job_portal is not null order by 1")).map((r) => r.job_portal),
  }));
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const timeline = sp.view === "timeline";
  return (
    <div className="space-y-5">
      <PageHeader
        title="Applications"
        description="Every job from saved to offer. Rows updated from Gmail show the source; statuses you set yourself are marked with a lock."
        actions={
          <>
            <a href={`/api/export/applications?${qs}&format=csv`} className="btn btn-secondary">
              <Download className="size-4" /> CSV
            </a>
            <a href={`/api/export/applications?${qs}&format=xlsx`} className="btn btn-secondary">
              <Download className="size-4" /> Excel
            </a>
            <Link href="/app/applications/new" className="btn btn-primary">
              <Plus className="size-4" /> Add application
            </Link>
          </>
        }
      />
      <form className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-7" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search company, role, location" className="input lg:col-span-2" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active pipeline</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="portal" defaultValue={sp.portal ?? ""} className="input" aria-label="Portal">
          <option value="">All portals</option>
          {portals.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="From date" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="To date" />
        <div className="flex gap-2">
          <select name="sort" defaultValue={sp.sort ?? ""} className="input" aria-label="Sort">
            <option value="">Recent activity</option>
            <option value="applied">Application date</option>
            <option value="company">Company</option>
            <option value="created">Date added</option>
          </select>
          <button className="btn btn-secondary">Filter</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm lg:col-span-7">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} /> Show archived
          </label>
          <span className="text-muted">View:</span>
          <Link href={`/app/applications?${new URLSearchParams({ ...sp, view: "" } as any)}`} className={!timeline ? "font-medium text-accent" : "text-ink-2"}>
            Table
          </Link>
          <Link href={`/app/applications?${new URLSearchParams({ ...sp, view: "timeline" } as any)}`} className={timeline ? "font-medium text-accent" : "text-ink-2"}>
            Timeline
          </Link>
          <Link href="/app/calendar" className="text-ink-2">
            Calendar
          </Link>
          <span className="ml-auto text-muted">{apps.length} result(s)</span>
        </div>
      </form>

      {!apps.length ? (
        <EmptyState icon={<Briefcase className="size-6" />} title="No applications match" action={<Link href="/app/applications/new" className="btn btn-primary">Add application</Link>}>
          Add one manually, save a job from Discover, capture one with the Chrome extension, or connect Gmail to detect them automatically.
        </EmptyState>
      ) : timeline ? (
        <ol className="relative space-y-3 border-l border-line pl-5">
          {apps.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute top-2 -left-[25px] size-2.5 rounded-full bg-accent" />
              <Link href={`/app/applications/${a.id}`} className="card block p-3 hover:border-line-strong">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{a.company}</span>
                  <span className="text-ink-2">· {a.role_title}</span>
                  <StatusBadge status={a.status} />
                  <span className="ml-auto text-xs text-muted">{fmtDate(a.applied_at ?? a.confirmation_received_at ?? a.created_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <ActionForm action={bulkAction} className="space-y-2" confirm="Apply this action to the selected applications?">
          <div className="flex flex-wrap items-center gap-2">
            <select name="op" className="input w-auto" aria-label="Bulk action" defaultValue="">
              <option value="" disabled>
                Bulk action…
              </option>
              <optgroup label="Set status">
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </optgroup>
              <option value="archive">Archive</option>
              <option value="unarchive">Unarchive</option>
              <option value="delete">Delete</option>
            </select>
            <SubmitButton className="btn btn-secondary btn-sm">Apply to selected</SubmitButton>
          </div>
          <div className="card overflow-x-auto">
            <table className="table w-full min-w-[920px]">
              <thead>
                <tr>
                  <th className="w-8">
                    <SelectAll name="ids" />
                  </th>
                  <th>Company / role</th>
                  <th>Status</th>
                  <th>Portal</th>
                  <th>Applied</th>
                  <th>Confirmation</th>
                  <th>Recruiter</th>
                  <th>Next action</th>
                  <th>Activity</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input type="checkbox" name="ids" value={a.id} aria-label={`Select ${a.company}`} />
                    </td>
                    <td>
                      <Link href={`/app/applications/${a.id}`} className="font-medium hover:text-accent">
                        {a.company}
                      </Link>
                      <span className="block text-ink-2">{a.role_title}</span>
                      {a.location && <span className="block text-xs text-muted">{a.location}</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={a.status} />
                        {a.status_locked && <Lock className="size-3 text-muted" aria-label="Set by you" />}
                      </div>
                      {a.status_source === "gmail" && <span className="text-[11px] text-muted">via Gmail</span>}
                    </td>
                    <td>{a.job_portal ?? "—"}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.applied_at)}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.confirmation_received_at)}</td>
                    <td>{a.recruiter_name ?? "—"}</td>
                    <td className="max-w-48">
                      {a.next_action ?? "—"}
                      {a.next_action_due && <span className="block text-xs text-muted">{fmtDate(a.next_action_due)}</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {timeAgo(a.last_activity_at)}
                      {a.email_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Mail className="size-3" /> {a.email_count}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
