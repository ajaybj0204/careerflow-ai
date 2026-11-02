import { Bell, ExternalLink } from "lucide-react";
import { freshnessLabel, listJobs, PROVIDERS } from "@careerflow/core";
import { truncate } from "@careerflow/shared";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { alertAction, discoverAction, dismissListingAction, saveListingAction } from "../_actions/jobs";

export const metadata = { title: "Discover Jobs" };

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; min?: string; mode?: string; provider?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    jobs: await listJobs(tx, { q: sp.q, minScore: sp.min ? Number(sp.min) : undefined, mode: sp.mode, provider: sp.provider }),
    alerts: await tx.query("select * from job_alerts order by created_at desc"),
    cp: await tx.one("select target_roles, preferred_locations from career_profiles limit 1"),
    prefs: await tx.one("select alert_frequency from user_preferences limit 1"),
  }));
  const providers = PROVIDERS.map((p) => ({ id: p.id, label: p.label, enabled: p.enabled() }));
  return (
    <div className="space-y-6">
      <PageHeader title="Discover Jobs" description="Listings from official APIs and permitted public feeds, ranked against your verified profile. Each card says where it came from and why it was recommended." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Search sources" className="lg:col-span-2">
          <ActionForm action={discoverAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="keywords">
                  Role or keywords
                </label>
                <input id="keywords" name="keywords" className="input" defaultValue={d.cp?.target_roles?.[0] ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="location">
                  Location
                </label>
                <input id="location" name="location" className="input" defaultValue={d.cp?.preferred_locations?.[0] ?? ""} />
              </div>
            </div>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="label">Sources</legend>
              {providers.map((p) => (
                <label key={p.id} className={`flex items-center gap-1.5 ${p.enabled ? "" : "text-muted"}`}>
                  <input type="checkbox" name="providers" value={p.id} defaultChecked={p.enabled} disabled={!p.enabled} />
                  {p.label}
                  {!p.enabled && p.id === "adzuna" && <span className="text-xs">(needs ADZUNA keys)</span>}
                </label>
              ))}
            </fieldset>
            <SubmitButton pendingText="Searching sources…">Find jobs</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            Remotive and Arbeitnow mainly list remote/international roles. For Indian listings add a free Adzuna API key (see DEPLOYMENT.md), or use the Job Portal Hub and the Chrome extension to capture jobs from Naukri, LinkedIn and others.
          </p>
        </Card>
        <Card title="Job alerts" description={`Run in the background. Default frequency: ${d.prefs?.alert_frequency ?? "daily"}.`}>
          <ul className="mb-3 space-y-2 text-sm">
            {d.alerts.map((a: any) => (
              <li key={a.id} className="flex items-center gap-2">
                <Bell className={`size-3.5 ${a.active ? "text-accent" : "text-muted"}`} />
                <span className="flex-1">
                  {a.name} <span className="text-xs text-muted">· {a.frequency}</span>
                </span>
                <ActionButton action={alertAction} fields={{ op: "toggle", id: a.id }} className="btn btn-ghost btn-sm">
                  {a.active ? "Pause" : "Resume"}
                </ActionButton>
                <ActionButton action={alertAction} fields={{ op: "delete", id: a.id }} className="btn btn-ghost btn-sm text-bad">
                  ×
                </ActionButton>
              </li>
            ))}
          </ul>
          <ActionForm action={alertAction} resetOnSuccess className="grid gap-2">
            <input type="hidden" name="op" value="create" />
            <input name="keywords" className="input" placeholder="Keywords" required />
            <input name="location" className="input" placeholder="Location" />
            <select name="frequency" className="input" defaultValue="daily" aria-label="Frequency">
              <option value="instant">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <SubmitButton className="btn btn-secondary btn-sm w-fit">Create alert</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} className="input w-56" placeholder="Filter by title or company" aria-label="Filter" />
        <select name="min" defaultValue={sp.min ?? ""} className="input w-auto" aria-label="Minimum match">
          <option value="">Any match</option>
          <option value="50">50+</option>
          <option value="70">70+</option>
        </select>
        <select name="mode" defaultValue={sp.mode ?? ""} className="input w-auto" aria-label="Work mode">
          <option value="">Any mode</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
        <button className="btn btn-secondary">Apply</button>
        <span className="ml-auto text-sm text-muted">{d.jobs.length} listing(s)</span>
      </form>

      {d.jobs.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {d.jobs.map((j: any) => (
            <div key={j.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-sm text-ink-2">
                    {j.company ?? "Company not listed"}
                    {j.location ? ` · ${j.location}` : ""}
                  </p>
                </div>
                <Badge tone={j.match_score >= 70 ? "good" : j.match_score >= 45 ? "info" : "neutral"} title="Profile match (not a hiring prediction)">
                  {j.match_score ?? "—"}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge>{providers.find((p) => p.id === j.provider)?.label ?? j.provider}</Badge>
                {j.work_mode && j.work_mode !== "unknown" && <Badge>{j.work_mode}</Badge>}
                {j.salary_text && <Badge tone="good">{j.salary_text}</Badge>}
                <Badge tone="neutral">{freshnessLabel(j.posted_at)}</Badge>
              </div>
              {j.match_reasons?.length > 0 && <p className="mt-2 text-xs text-ink-2">{j.match_reasons.join(" · ")}</p>}
              <p className="mt-2 flex-1 text-sm text-ink-2">{truncate(j.description ?? "", 220)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a href={j.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  Apply on source <ExternalLink className="size-3" />
                </a>
                <ActionButton action={saveListingAction} fields={{ id: j.id }} className="btn btn-primary btn-sm">
                  Save
                </ActionButton>
                <ActionButton action={dismissListingAction} fields={{ id: j.id }} className="btn btn-ghost btn-sm">
                  Not interested
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No listings yet">Run a search above. Listings are deduplicated across sources and ranked against your verified skills, target roles and locations.</EmptyState>
      )}
    </div>
  );
}
