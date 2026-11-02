import Link from "next/link";
import { CalendarClock, ClipboardCheck, FileText, Inbox, Mail, MessagesSquare, Sparkles, Upload } from "lucide-react";
import { computeMetrics, dailyPlan } from "@careerflow/core";
import { Badge, Card, EmptyState, fmtDate, Notice, PageHeader, Stat, StatusBadge, timeAgo } from "@/components/ui";
import { withUser } from "@/lib/session";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    plan: await dailyPlan(tx),
    metrics: await computeMetrics(tx),
    profile: await tx.one("select p.full_name, p.user_type, (select count(*)::int from master_resumes) as resumes, (select count(*)::int from verified_skills where verified) as skills from profiles p limit 1"),
    gmail: await tx.one("select status from gmail_connections limit 1"),
    recent: await tx.query("select e.type, e.occurred_at, a.company, a.id from application_events e join applications a on a.id = e.application_id where e.type in ('recruiter_reply','interview_requested','assessment_assigned','offer_received','rejection_received','confirmation_received') order by e.occurred_at desc limit 6"),
    recs: await tx.query("select * from career_recommendations where dismissed_at is null order by created_at desc limit 3"),
    learning: await tx.one("select count(*) filter (where completed_at is not null)::int as done, count(*)::int as total from learning_modules m join learning_paths p on p.id = m.path_id where p.status = 'active'"),
    recentApps: await tx.query("select id, company, role_title, status, last_activity_at from applications where not archived order by last_activity_at desc limit 5"),
  }));
  const p = d.plan;
  const name = d.profile?.full_name?.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}${name ? `, ${name}` : ""}`}
        description="Your daily career action plan, built from your applications, emails and practice."
        actions={
          <>
            <Link href="/app/applications/new" className="btn btn-secondary">
              Add application
            </Link>
            <Link href="/app/resume" className="btn btn-primary">
              <FileText className="size-4" /> Prepare a resume
            </Link>
          </>
        }
      />
      {sp.welcome && (
        <Notice tone="good" title="You're set up">
          Next: <Link className="link" href="/app/resume">upload your master resume</Link>, review the extracted facts in <Link className="link" href="/app/profile">My Career Profile</Link>, and <Link className="link" href="/app/settings#gmail">connect Gmail</Link> to track applications automatically.
        </Notice>
      )}
      {(!d.profile?.resumes || !d.gmail) && !sp.welcome && (
        <div className="grid gap-3 sm:grid-cols-2">
          {!d.profile?.resumes && (
            <Link href="/app/resume" className="card flex items-center gap-3 p-4 hover:border-accent">
              <Upload className="size-5 text-accent" />
              <span className="text-sm">
                <span className="font-medium">Upload your master resume</span>
                <span className="block text-ink-2">So you never have to re-enter your work history.</span>
              </span>
            </Link>
          )}
          {!d.gmail && (
            <Link href="/app/settings#gmail" className="card flex items-center gap-3 p-4 hover:border-accent">
              <Mail className="size-5 text-accent" />
              <span className="text-sm">
                <span className="font-medium">Connect Gmail (optional)</span>
                <span className="block text-ink-2">Detect confirmations, replies, interviews and offers automatically.</span>
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Applications" value={d.metrics.submitted} hint={`${d.metrics.saved} saved`} href="/app/applications" />
        <Stat label="Response rate" value={d.metrics.responseRate === null ? "—" : `${d.metrics.responseRate}%`} hint={`${d.metrics.responded} responded`} href="/app/analytics" />
        <Stat label="Interviews" value={d.metrics.interviews} hint={d.metrics.interviewRate === null ? "" : `${d.metrics.interviewRate}% of applied`} href="/app/interview" />
        <Stat label="Offers" value={d.metrics.offers} href="/app/offers" />
        <Stat label="Needs review" value={p.reviewCount} hint="emails & status checks" href="/app/review" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Today's action plan" description="What deserves your attention now.">
            <ul className="divide-y divide-line">
              {p.interviews.map((i: any) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <CalendarClock className="size-4 shrink-0 text-progress" />
                  <span className="flex-1">
                    Interview{i.company ? ` with ${i.company}` : ""} {i.scheduled_at ? `· ${fmtDate(i.scheduled_at, true)}` : "· time to be confirmed"}
                  </span>
                  <Link href={`/app/interview?application=${i.application_id ?? ""}`} className="btn btn-secondary btn-sm">
                    Prepare
                  </Link>
                </li>
              ))}
              {p.assessments.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <ClipboardCheck className="size-4 shrink-0 text-warn" />
                  <span className="flex-1">
                    Assessment{a.company ? ` for ${a.company}` : ""}: {a.title} {a.deadline ? `· due ${fmtDate(a.deadline, true)}` : ""}
                  </span>
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      Open
                    </a>
                  )}
                </li>
              ))}
              {p.reviewCount > 0 && (
                <li className="flex items-center gap-3 py-2.5 text-sm">
                  <Inbox className="size-4 shrink-0 text-accent" />
                  <span className="flex-1">{p.reviewCount} email(s) or status change(s) need your confirmation</span>
                  <Link href="/app/review" className="btn btn-secondary btn-sm">
                    Review
                  </Link>
                </li>
              )}
              {p.followUps.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Mail className="size-4 shrink-0 text-info" />
                  <span className="flex-1">
                    Follow up with {a.company} ({a.role_title}) · last activity {timeAgo(a.last_activity_at)}
                  </span>
                  <Link href={`/app/messages?kind=follow_up&application=${a.id}`} className="btn btn-secondary btn-sm">
                    Draft
                  </Link>
                </li>
              ))}
              {p.saved.slice(0, 3).map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <span className="flex-1">
                    Saved: {a.role_title} at {a.company}
                  </span>
                  <Link href={`/app/applications/${a.id}`} className="btn btn-secondary btn-sm">
                    Open
                  </Link>
                </li>
              ))}
              {p.tasks.map((t: any) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <ClipboardCheck className="size-4 shrink-0 text-muted" />
                  <span className="flex-1">{t.title}</span>
                  {t.due_at && <span className="text-xs text-muted">{fmtDate(t.due_at)}</span>}
                </li>
              ))}
            </ul>
            {!p.interviews.length && !p.assessments.length && !p.followUps.length && !p.saved.length && !p.tasks.length && !p.reviewCount && (
              <EmptyState title="Nothing urgent today">Discover new roles or practise for upcoming interviews.</EmptyState>
            )}
          </Card>

          <Card title="Recommended jobs" actions={<Link href="/app/discover" className="btn btn-ghost btn-sm">See all</Link>}>
            {p.jobs.length ? (
              <ul className="divide-y divide-line">
                {p.jobs.map((j: any) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Badge tone={j.match_score >= 75 ? "good" : "info"}>{j.match_score}</Badge>
                    <span className="flex-1">
                      {j.title}
                      {j.company ? <span className="text-ink-2"> · {j.company}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">
                No fresh matches yet. <Link href="/app/discover" className="link">Search for jobs</Link> or create an alert.
              </p>
            )}
          </Card>

          <Card title="Recent applications" actions={<Link href="/app/applications" className="btn btn-ghost btn-sm">All applications</Link>}>
            {d.recentApps.length ? (
              <ul className="divide-y divide-line">
                {d.recentApps.map((a: any) => (
                  <li key={a.id}>
                    <Link href={`/app/applications/${a.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent">
                      <span className="flex-1">
                        <span className="font-medium">{a.company}</span> <span className="text-ink-2">· {a.role_title}</span>
                      </span>
                      <StatusBadge status={a.status} />
                      <span className="hidden w-20 text-right text-xs text-muted sm:block">{timeAgo(a.last_activity_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No applications yet" action={<Link href="/app/applications/new" className="btn btn-primary">Add your first application</Link>} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Career insights" actions={<Link href="/app/strategy" className="btn btn-ghost btn-sm">Strategy</Link>}>
            {d.recs.length ? (
              <ul className="space-y-3">
                {d.recs.map((r: any) => (
                  <li key={r.id} className="text-sm">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-ink-2">{r.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Insights appear as you add applications and practice. They are refreshed daily in the background.</p>
            )}
          </Card>
          <Card title="Recent recruiter activity">
            {d.recent.length ? (
              <ul className="space-y-2.5 text-sm">
                {d.recent.map((e: any, i: number) => (
                  <li key={i}>
                    <Link href={`/app/applications/${e.id}`} className="hover:text-accent">
                      <span className="font-medium">{e.company}</span> <span className="text-ink-2">· {e.type.replace(/_/g, " ")}</span>
                    </Link>
                    <span className="block text-xs text-muted">{timeAgo(e.occurred_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Connect Gmail to see replies here automatically.</p>
            )}
          </Card>
          <Card title="Learning progress" actions={<Link href="/app/skills" className="btn btn-ghost btn-sm">Skills</Link>}>
            {d.learning?.total ? (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-accent" style={{ width: `${Math.round((d.learning.done / d.learning.total) * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {d.learning.done} of {d.learning.total} activities completed
                </p>
                {p.modules[0] && <p className="mt-2 text-sm">Next: {p.modules[0].title}</p>}
              </>
            ) : (
              <p className="text-sm text-ink-2">No active learning plan.</p>
            )}
          </Card>
          <Card title="Shortcuts">
            <div className="grid gap-2">
              <Link href="/app/copilot" className="btn btn-secondary justify-start">
                <Sparkles className="size-4" /> Answer an application question
              </Link>
              <Link href="/app/interview" className="btn btn-secondary justify-start">
                <MessagesSquare className="size-4" /> Interview Tomorrow mode
              </Link>
              <Link href="/app/cover-letters" className="btn btn-secondary justify-start">
                <Mail className="size-4" /> Write a cover letter
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
