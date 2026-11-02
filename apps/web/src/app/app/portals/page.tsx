import { ExternalLink, Search, Star } from "lucide-react";
import { portalSearchUrl } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, Lettermark, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { portalAction } from "../_actions/jobs";

export const metadata = { title: "Job Portal Hub" };

export default async function Portals({ searchParams }: { searchParams: Promise<{ q?: string; l?: string; cat?: string }> }) {
  const sp = await searchParams;
  const d = await withUser(async (tx) => ({
    sources: await tx.query("select s.*, (f.source_id is not null) as fav from job_sources s left join portal_favorites f on f.source_id = s.id order by (f.source_id is not null) desc, s.user_id nulls first, s.name"),
    searches: await tx.query("select s.*, j.name as source_name from saved_searches s left join job_sources j on j.id = s.source_id order by s.created_at desc"),
    cp: await tx.one("select target_roles, preferred_locations, user_type from career_profiles c, profiles p limit 1"),
  }));
  const kw = sp.q ?? d.cp?.target_roles?.[0] ?? "";
  const loc = sp.l ?? d.cp?.preferred_locations?.[0] ?? "";
  const cats = [...new Set(d.sources.map((s: any) => s.category))];
  const list = d.sources.filter((s: any) => !sp.cat || s.category === sp.cat);
  const fresher = d.cp?.user_type === "fresher";
  return (
    <div className="space-y-6">
      <PageHeader title="Job Portal Hub" description="Open India's major job portals directly, with your keywords. CareerFlow never stores portal passwords and cannot see your accounts on these sites." />
      <Notice tone="info">No job portal guarantees that every listing is genuine. Check suspicious offers with the <a href="/app/scam-check" className="link">Scam Detector</a>.</Notice>
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">
            Keywords
          </label>
          <input id="q" name="q" defaultValue={kw} className="input" />
        </div>
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="l">
            Location
          </label>
          <input id="l" name="l" defaultValue={loc} className="input" />
        </div>
        <button className="btn btn-primary">
          <Search className="size-4" /> Update search links
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        <a href={`?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(loc)}`} className={`btn btn-sm ${!sp.cat ? "btn-primary" : "btn-secondary"}`}>
          All
        </a>
        {cats.map((c: any) => (
          <a key={c} href={`?cat=${c}&q=${encodeURIComponent(kw)}&l=${encodeURIComponent(loc)}`} className={`btn btn-sm capitalize ${sp.cat === c ? "btn-primary" : "btn-secondary"}`}>
            {c}
          </a>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s: any) => {
          const recommended = (fresher && s.best_for.includes("freshers")) || (!fresher && s.best_for.some((b: string) => ["experienced", "operations", "fintech", "business", "analytics"].includes(b)));
          return (
            <div key={s.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <Lettermark name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge>{s.category}</Badge>
                    {recommended && <Badge tone="accent">Suggested for you</Badge>}
                    {s.user_id && <Badge tone="info">Custom</Badge>}
                  </div>
                </div>
                <ActionButton action={portalAction} fields={{ op: "favorite", id: s.id }} className="btn btn-ghost btn-sm" title={s.fav ? "Remove favourite" : "Add favourite"}>
                  <Star className={`size-4 ${s.fav ? "fill-warn text-warn" : ""}`} />
                </ActionButton>
              </div>
              {s.description && <p className="mt-2 flex-1 text-sm text-ink-2">{s.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                  Open <ExternalLink className="size-3" />
                </a>
                {s.search_url_template && kw && (
                  <a href={portalSearchUrl(s.search_url_template, s.url, kw, loc)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                    Search “{kw.length > 18 ? kw.slice(0, 18) + "…" : kw}”
                  </a>
                )}
                {s.user_id && (
                  <ActionButton action={portalAction} fields={{ op: "delete-custom", id: s.id }} className="btn btn-ghost btn-sm text-bad" confirm="Remove this custom portal?">
                    Remove
                  </ActionButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Saved search URLs" description="Paste a search results URL from any portal to reopen it with one click.">
          <ul className="mb-3 divide-y divide-line">
            {d.searches.map((s: any) => (
              <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:text-accent">
                  {s.label}
                  {s.source_name && <span className="text-muted"> · {s.source_name}</span>}
                </a>
                <ActionButton action={portalAction} fields={{ op: "delete-search", id: s.id }} className="btn btn-ghost btn-sm">
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
          <ActionForm action={portalAction} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="op" value="search" />
            <input name="label" className="input" placeholder="Label" />
            <select name="sourceId" className="input" aria-label="Portal">
              <option value="">Portal (optional)</option>
              {d.sources.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input name="url" className="input sm:col-span-2" placeholder="https://…" required />
            <SubmitButton className="btn btn-secondary btn-sm w-fit">Save search</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Add a custom portal" description="e.g. a company careers page or a niche job board.">
          <ActionForm action={portalAction} resetOnSuccess className="grid gap-2">
            <input type="hidden" name="op" value="custom" />
            <input name="name" className="input" placeholder="Name" required />
            <input name="url" className="input" placeholder="https://…" required />
            <input name="description" className="input" placeholder="Description (optional)" />
            <SubmitButton className="btn btn-secondary btn-sm w-fit">Add portal</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
