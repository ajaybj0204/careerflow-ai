import Link from "next/link";
import { Bookmark } from "lucide-react";
import { listApplications } from "@careerflow/core";
import { ActionButton } from "@/components/client";
import { EmptyState, fmtDate, PageHeader, StatusBadge } from "@/components/ui";
import { withUser } from "@/lib/session";
import { setStatusAction } from "../_actions/applications";

export const metadata = { title: "Saved Opportunities" };

export default async function Saved() {
  const apps = await withUser(async (tx) => [...(await listApplications(tx, { status: "saved" })), ...(await listApplications(tx, { status: "preparing" }))]);
  return (
    <div className="space-y-5">
      <PageHeader title="Saved Opportunities" description="Jobs you are considering. Prepare documents here, apply on the original portal, then mark as applied — it stays the same record." actions={<Link href="/app/applications/new" className="btn btn-primary">Save a job</Link>} />
      {apps.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/applications/${a.id}`} className="font-medium hover:text-accent">
                    {a.role_title}
                  </Link>
                  <p className="text-sm text-ink-2">
                    {a.company}
                    {a.location ? ` · ${a.location}` : ""}
                  </p>
                  <p className="text-xs text-muted">Saved {fmtDate(a.created_at)}{a.job_portal ? ` · ${a.job_portal}` : ""}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.job_url && (
                  <a href={a.job_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    Open posting
                  </a>
                )}
                <Link href={`/app/resume?application=${a.id}`} className="btn btn-secondary btn-sm">
                  Tailor resume
                </Link>
                {a.status === "saved" && (
                  <ActionButton action={setStatusAction} fields={{ id: a.id, status: "preparing" }}>
                    Preparing
                  </ActionButton>
                )}
                <ActionButton action={setStatusAction} fields={{ id: a.id, status: "applied", reason: "Applied on the portal" }} className="btn btn-primary btn-sm">
                  I applied
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Bookmark className="size-6" />} title="No saved opportunities" action={<Link href="/app/discover" className="btn btn-primary">Discover jobs</Link>}>
          Save jobs from Discover, the Job Portal Hub, or the Chrome extension.
        </EmptyState>
      )}
    </div>
  );
}
