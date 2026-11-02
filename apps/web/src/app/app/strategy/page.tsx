import Link from "next/link";
import { computeMetrics } from "@careerflow/core";
import { ActionButton } from "@/components/client";
import { Badge, Card, EmptyState, PageHeader, Stat, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";
import { dismissRecAction, refreshStrategyAction } from "../_actions/misc";

export const metadata = { title: "Career Strategy" };

const KIND: Record<string, string> = { follow_up: "Follow-up", source: "Job sources", role_focus: "Role focus", skill: "Skills", interview_prep: "Interview prep", practice: "Practice", resume: "Resume", activity: "Activity" };

export default async function Strategy() {
  const d = await withUser(async (tx) => ({
    recs: await tx.query("select * from career_recommendations where dismissed_at is null order by created_at desc"),
    m: await computeMetrics(tx),
  }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Career Strategy"
        description="Recommendations from your own applications, responses, interviews and practice. Each shows the evidence behind it. No hiring probabilities."
        actions={
          <ActionButton action={refreshStrategyAction} className="btn btn-primary" pendingText="Analysing…">
            Refresh analysis
          </ActionButton>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Submitted" value={d.m.submitted} />
        <Stat label="Response rate" value={d.m.responseRate === null ? "—" : `${d.m.responseRate}%`} hint={`${d.m.responded} of ${d.m.submitted}`} />
        <Stat label="Interview rate" value={d.m.interviewRate === null ? "—" : `${d.m.interviewRate}%`} hint={`${d.m.interviews} of ${d.m.submitted}`} />
        <Stat label="Avg. days to response" value={d.m.avgResponseDays ?? "—"} />
      </div>
      {d.recs.length ? (
        <div className="space-y-3">
          {d.recs.map((r: any) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <Badge tone="accent">{KIND[r.kind] ?? r.kind}</Badge>
                <p className="flex-1 font-medium">{r.title}</p>
                <span className="text-xs text-muted">{timeAgo(r.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{r.detail}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent">Evidence</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify({ ...r.evidence, link: undefined }, null, 2)}</pre>
              </details>
              <div className="mt-2 flex gap-2">
                {r.evidence?.link && (
                  <Link href={r.evidence.link} className="btn btn-secondary btn-sm">
                    Act on this
                  </Link>
                )}
                <ActionButton action={dismissRecAction} fields={{ id: r.id }} className="btn btn-ghost btn-sm">
                  Dismiss
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No recommendations yet">Click “Refresh analysis”. Recommendations need some data — for example, a few submitted applications.</EmptyState>
      )}
      <Card title="How these are made">
        <p className="text-sm text-ink-2">
          Rules look at follow-ups due, response rates by source and role (with minimum sample sizes), skill gaps across your saved job descriptions, upcoming interviews without practice, open weak areas, and whether tailored resumes get more responses. When AI is configured, a short summary is written from these numbers only.
        </p>
      </Card>
    </div>
  );
}
