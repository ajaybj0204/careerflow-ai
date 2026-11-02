import { STATUS_LABEL } from "@careerflow/shared";
import { computeMetrics } from "@careerflow/core";
import { GroupBars, StatusBars, WeeklyChart } from "@/components/charts";
import { Card, PageHeader, Stat } from "@/components/ui";
import { withUser } from "@/lib/session";

export const metadata = { title: "Analytics" };

export default async function Analytics({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const m = await withUser((tx) => computeMetrics(tx, { from: sp.from || null, to: sp.to || null }));
  const qs = new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) }).toString();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="All numbers come from your stored records. Hover a metric's definition to see exactly how it is calculated."
        actions={
          <>
            <a href={`/api/export/analytics?${qs}&format=csv`} className="btn btn-secondary">
              CSV
            </a>
            <a href={`/api/export/analytics?${qs}&format=pdf`} className="btn btn-secondary">
              PDF
            </a>
          </>
        }
      />
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="from">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={sp.from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={sp.to} className="input" />
        </div>
        <button className="btn btn-secondary">Apply</button>
        {(sp.from || sp.to) && (
          <a href="/app/analytics" className="btn btn-ghost">
            Clear
          </a>
        )}
      </form>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div title={m.definitions.submitted}>
          <Stat label="Total applications" value={m.submitted} hint={`${m.saved} saved, not applied`} />
        </div>
        <div title={m.definitions.responseRate}>
          <Stat label="Response rate" value={m.responseRate === null ? "—" : `${m.responseRate}%`} hint={`${m.responded} of ${m.submitted}`} />
        </div>
        <div title={m.definitions.interviewRate}>
          <Stat label="Interview conversion" value={m.interviewRate === null ? "—" : `${m.interviewRate}%`} hint={`${m.interviews} of ${m.submitted}`} />
        </div>
        <div title={m.definitions.offerRate}>
          <Stat label="Offer conversion" value={m.offerRate === null ? "—" : `${m.offerRate}%`} hint={`${m.offers} of ${m.submitted}`} />
        </div>
        <Stat label="Rejections" value={m.rejections} />
        <div title={m.definitions.avgResponseDays}>
          <Stat label="Avg. response time" value={m.avgResponseDays === null ? "—" : `${m.avgResponseDays} d`} />
        </div>
        <Stat label="Resume versions used" value={m.resumeVersions.distinctVersions} hint={`${m.resumeVersions.tailored.submitted} apps with a tailored resume`} />
        <Stat label="Practice done" value={m.practice.mockInterviews + m.practice.scenarios + m.practice.modulesDone + m.practice.exercises} hint={`${m.practice.mockInterviews} mocks · ${m.practice.scenarios} scenarios · ${m.practice.exercises} exercises`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Applications per week">
          <WeeklyChart data={m.weekly} />
        </Card>
        <Card title="Current status">
          <StatusBars data={m.statusBreakdown.map((s) => ({ status: STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status, n: s.n }))} />
        </Card>
        <Card title="By platform" description="Applied vs responses vs interviews">
          <GroupBars data={m.byPlatform} />
        </Card>
        <Card title="By role">
          <GroupBars data={m.byRole} />
        </Card>
        <Card title="By location">
          <GroupBars data={m.byLocation} />
        </Card>
        <Card title="Definitions">
          <dl className="space-y-2 text-sm">
            {Object.entries(m.definitions).map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
