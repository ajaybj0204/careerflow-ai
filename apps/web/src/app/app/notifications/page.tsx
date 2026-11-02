import Link from "next/link";
import { Bell } from "lucide-react";
import { activitySummary } from "@careerflow/core";
import { ActionButton } from "@/components/client";
import { Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";
import { markReadAction } from "../_actions/misc";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const d = await withUser(async (tx) => ({
    items: await tx.query("select * from notifications order by created_at desc limit 100"),
    week: await activitySummary(tx, 7),
    month: await activitySummary(tx, 30),
  }));
  const unread = d.items.filter((n: any) => !n.read_at).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Choose which types you get in Settings."
        actions={
          unread ? (
            <ActionButton action={markReadAction} className="btn btn-secondary">
              Mark all read
            </ActionButton>
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["This week", d.week],
          ["Last 30 days", d.month],
        ].map(([label, s]: any) => (
          <Card key={label} title={`${label} summary`}>
            <p className="text-sm text-ink-2">
              {s.applied} applied · {s.saved} saved · {s.responses} responses · {s.interviews} interviews · {s.rejections} rejections · {s.practice} practice activities
            </p>
          </Card>
        ))}
      </div>
      {d.items.length ? (
        <ul className="card divide-y divide-line">
          {d.items.map((n: any) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-accent-soft/40"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
              <div className="min-w-0 flex-1 text-sm">
                {n.link ? (
                  <Link href={n.link} className="font-medium hover:text-accent">
                    {n.title}
                  </Link>
                ) : (
                  <p className="font-medium">{n.title}</p>
                )}
                {n.body && <p className="whitespace-pre-line text-ink-2">{n.body}</p>}
                <p className="text-xs text-muted">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <ActionButton action={markReadAction} fields={{ id: n.id }} className="btn btn-ghost btn-sm">
                  Mark read
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Bell className="size-6" />} title="No notifications" />
      )}
    </div>
  );
}
