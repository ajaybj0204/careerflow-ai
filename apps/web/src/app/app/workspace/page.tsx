import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";
import { EmptyState, PageHeader, StatusBadge, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";

export const metadata = { title: "Universal Workspace" };

export default async function WorkspaceIndex() {
  const apps = await withUser((tx) =>
    tx.query(
      `select a.id, a.company, a.role_title, a.status, a.last_activity_at,
        (select count(*)::int from documents d where d.application_id = a.id) as docs,
        (select count(*)::int from application_email_links l where l.application_id = a.id) as emails,
        (select count(*)::int from interviews i where i.application_id = a.id) as interviews
       from applications a where not a.archived order by a.last_activity_at desc limit 60`,
    ),
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Universal Workspace" description="Every saved or submitted job has one persistent workspace: job description, documents, questions, emails, interview prep, timeline and analytics." />
      {apps.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a: any) => (
            <Link key={a.id} href={`/app/applications/${a.id}`} className="card p-4 transition hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.company}</p>
                  <p className="truncate text-sm text-ink-2">{a.role_title}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-3 text-xs text-muted">
                {a.docs} docs · {a.emails} emails · {a.interviews} interviews · {timeAgo(a.last_activity_at)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<PanelsTopLeft className="size-6" />} title="No workspaces yet" action={<Link href="/app/applications/new" className="btn btn-primary">Save a job</Link>} />
      )}
    </div>
  );
}
