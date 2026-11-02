import { canonicalSkill, detectSkills, normalizeCompany, normalizeRole, stripHtml, tokenSimilarity, truncate } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { notify } from "./automation";
import { getCareerContext, type CareerContext } from "./career-memory";

/**
 * Job discovery from official APIs and permitted public feeds only. No scraping of portals,
 * no bypassing logins. Each provider is labelled in the UI with its source.
 */
export interface NormalizedJob {
  provider: string;
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  workMode: "remote" | "hybrid" | "onsite" | "unknown";
  salaryText: string | null;
  salaryMinLpa: number | null;
  salaryMaxLpa: number | null;
  postedAt: Date | null;
  url: string;
  description: string;
  tags: string[];
}

export interface JobProvider {
  id: string;
  label: string;
  enabled(): boolean;
  search(q: { keywords: string; location?: string | null }): Promise<NormalizedJob[]>;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "CareerFlowAI/0.1 (job search assistant)" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const PROVIDERS: JobProvider[] = [
  {
    id: "adzuna",
    label: "Adzuna (India)",
    enabled: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    async search({ keywords, location }) {
      const p = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID!, app_key: process.env.ADZUNA_APP_KEY!, what: keywords, results_per_page: "50", max_days_old: "30", "content-type": "application/json" });
      if (location) p.set("where", location);
      const j = await getJson(`https://api.adzuna.com/v1/api/jobs/in/search/1?${p}`);
      return (j.results ?? []).map(
        (r: any): NormalizedJob => ({
          provider: "adzuna",
          externalId: String(r.id),
          title: r.title?.replace(/<[^>]+>/g, "") ?? "Untitled",
          company: r.company?.display_name ?? null,
          location: r.location?.display_name ?? null,
          workMode: /remote/i.test(`${r.title} ${r.description}`) ? "remote" : "unknown",
          salaryText: r.salary_min ? `₹${Math.round(r.salary_min / 1e5 * 10) / 10}${r.salary_max ? `–${Math.round(r.salary_max / 1e5 * 10) / 10}` : ""} LPA${r.salary_is_predicted === "1" ? " (estimated by Adzuna)" : ""}` : null,
          salaryMinLpa: r.salary_min && r.salary_is_predicted !== "1" ? r.salary_min / 1e5 : null,
          salaryMaxLpa: r.salary_max && r.salary_is_predicted !== "1" ? r.salary_max / 1e5 : null,
          postedAt: r.created ? new Date(r.created) : null,
          url: r.redirect_url,
          description: stripHtml(r.description ?? ""),
          tags: [r.category?.label].filter(Boolean),
        }),
      );
    },
  },
  {
    id: "remotive",
    label: "Remotive (remote jobs)",
    enabled: () => process.env.DISABLE_REMOTIVE !== "true",
    async search({ keywords }) {
      const j = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keywords)}&limit=40`);
      return (j.jobs ?? []).map(
        (r: any): NormalizedJob => ({
          provider: "remotive",
          externalId: String(r.id),
          title: r.title,
          company: r.company_name ?? null,
          location: r.candidate_required_location || "Remote",
          workMode: "remote",
          salaryText: r.salary || null,
          salaryMinLpa: null,
          salaryMaxLpa: null,
          postedAt: r.publication_date ? new Date(r.publication_date) : null,
          url: r.url,
          description: stripHtml(r.description ?? ""),
          tags: r.tags ?? [],
        }),
      );
    },
  },
  {
    id: "arbeitnow",
    label: "Arbeitnow (public feed)",
    enabled: () => process.env.DISABLE_ARBEITNOW !== "true",
    async search({ keywords }) {
      const j = await getJson("https://www.arbeitnow.com/api/job-board-api");
      const words = keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      return (j.data ?? [])
        .filter((r: any) => words.some((w) => `${r.title} ${r.tags?.join(" ")}`.toLowerCase().includes(w)))
        .map(
          (r: any): NormalizedJob => ({
            provider: "arbeitnow",
            externalId: r.slug,
            title: r.title,
            company: r.company_name ?? null,
            location: r.location ?? null,
            workMode: r.remote ? "remote" : "unknown",
            salaryText: null,
            salaryMinLpa: null,
            salaryMaxLpa: null,
            postedAt: r.created_at ? new Date(r.created_at * 1000) : null,
            url: r.url,
            description: stripHtml(r.description ?? ""),
            tags: r.tags ?? [],
          }),
        );
    },
  },
];

export function jobDedupeKey(j: Pick<NormalizedJob, "company" | "title" | "location">) {
  return `${normalizeCompany(j.company)}|${normalizeRole(j.title)}|${(j.location ?? "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 20)}`;
}

export function freshnessLabel(postedAt: Date | string | null, now = new Date()): string {
  if (!postedAt) return "Posting date not provided by source";
  const days = Math.floor((now.getTime() - new Date(postedAt).getTime()) / 864e5);
  if (days <= 0) return "Posted today (per source)";
  if (days === 1) return "Posted yesterday (per source)";
  if (days < 30) return `Posted ${days} days ago (per source)`;
  return `Posted over ${Math.floor(days / 30)} month(s) ago — may be closed`;
}

/** Explainable ranking against the verified profile. */
export function rankJob(j: Pick<NormalizedJob, "title" | "description" | "location" | "workMode" | "salaryMinLpa" | "salaryMaxLpa" | "postedAt">, ctx: CareerContext) {
  const reasons: string[] = [];
  let score = 0;
  const verified = new Set(ctx.skills.map((s) => canonicalSkill(s.name)));
  const jobSkills = detectSkills(`${j.title}\n${j.description}`);
  const overlap = jobSkills.filter((s) => verified.has(s));
  if (jobSkills.length) {
    score += Math.round((overlap.length / jobSkills.length) * 45);
    if (overlap.length) reasons.push(`Uses your skills: ${overlap.slice(0, 5).join(", ")}`);
  } else score += 15;
  const roleSim = Math.max(0, ...ctx.profile.targetRoles.map((r) => tokenSimilarity(r, j.title)));
  if (roleSim >= 0.5) {
    score += 25;
    reasons.push("Matches one of your target roles");
  } else if (roleSim > 0) score += 10;
  const avoid = ctx.profile.avoidRoles.some((r) => tokenSimilarity(r, j.title) >= 0.5 || j.title.toLowerCase().includes(r.toLowerCase()) || (/\b(bpo|voice process|non-voice|customer support executive|telecaller)\b/i.test(j.title) && /bpo|support/i.test(r)));
  if (avoid) {
    score -= 60;
    reasons.push("Looks like a role type you want to avoid");
  }
  const prefs = ctx.profile.preferredLocations.map((l) => l.toLowerCase().replace("bangalore", "bengaluru"));
  const loc = (j.location ?? "").toLowerCase().replace("bangalore", "bengaluru");
  if (j.workMode === "remote" && (ctx.profile.workModes.includes("remote") || !ctx.profile.workModes.length)) {
    score += 10;
    reasons.push("Remote");
  } else if (prefs.some((p) => loc.includes(p))) {
    score += 15;
    reasons.push(`In ${j.location}`);
  }
  if (ctx.profile.expectedCtcMinLpa && j.salaryMaxLpa) {
    if (j.salaryMaxLpa >= ctx.profile.expectedCtcMinLpa) {
      score += 10;
      reasons.push("Disclosed salary reaches your expectation");
    } else {
      score -= 10;
      reasons.push("Disclosed salary is below your expectation");
    }
  }
  if (j.postedAt && Date.now() - new Date(j.postedAt).getTime() < 7 * 864e5) score += 5;
  return { score: Math.max(0, Math.min(100, score)), reasons, avoid };
}

export async function discoverJobs(db: Database, userId: string, q: { keywords: string; location?: string | null; providers?: string[] }) {
  const providers = PROVIDERS.filter((p) => p.enabled() && (!q.providers?.length || q.providers.includes(p.id)));
  const errors: { provider: string; error: string }[] = [];
  const results: NormalizedJob[] = [];
  await Promise.all(
    providers.map(async (p) => {
      try {
        results.push(...(await p.search(q)));
      } catch (e) {
        errors.push({ provider: p.label, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  return db.withUser(userId, async (tx) => {
    const ctx = await getCareerContext(tx);
    const seen = new Set<string>();
    let stored = 0;
    for (const j of results) {
      if (!j.url || !/^https?:\/\//.test(j.url)) continue;
      const key = jobDedupeKey(j);
      if (seen.has(key)) continue; // duplicate listing across providers
      seen.add(key);
      const rank = rankJob(j, ctx);
      const r = await tx.query(
        `insert into job_listings (user_id, provider, external_id, title, company, location, work_mode, salary_min_lpa, salary_max_lpa, salary_text, posted_at, url, description, tags, match_score, match_reasons, dedupe_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::text[],$15,$16::jsonb,$17)
         on conflict (user_id, dedupe_key) do update set match_score = excluded.match_score, match_reasons = excluded.match_reasons, fetched_at = now()
         returning (xmax = 0) as inserted`,
        [userId, j.provider, j.externalId, truncate(j.title, 200), j.company, j.location, j.workMode, j.salaryMinLpa, j.salaryMaxLpa, j.salaryText, j.postedAt?.toISOString() ?? null, j.url, truncate(j.description, 20000), j.tags.slice(0, 15), rank.score, JSON.stringify(rank.reasons), key],
      );
      if (r[0]?.inserted) stored++;
    }
    return { fetched: results.length, unique: seen.size, stored, providers: providers.map((p) => p.label), errors };
  });
}

export async function listJobs(tx: Tx, f: { q?: string; minScore?: number; mode?: string; provider?: string } = {}) {
  const where = ["not dismissed"];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q.toLowerCase()}%`);
    where.push(`(lower(title) like $${params.length} or lower(coalesce(company,'')) like $${params.length})`);
  }
  if (f.minScore) {
    params.push(f.minScore);
    where.push(`coalesce(match_score,0) >= $${params.length}`);
  }
  if (f.mode) {
    params.push(f.mode);
    where.push(`work_mode = $${params.length}`);
  }
  if (f.provider) {
    params.push(f.provider);
    where.push(`provider = $${params.length}`);
  }
  return tx.query(`select * from job_listings where ${where.join(" and ")} order by match_score desc nulls last, posted_at desc nulls last limit 200`, params);
}

/** Saves a listing as an opportunity (status "saved") in the shared application database. */
export async function saveListing(tx: Tx, userId: string, listingId: string) {
  const { createApplication } = await import("./applications");
  const l = await tx.one("select * from job_listings where id = $1", [listingId]);
  if (!l) throw new Error("Listing not found");
  return createApplication(
    tx,
    userId,
    { company: l.company ?? "Unknown company", roleTitle: l.title, location: l.location, workMode: l.work_mode, jobUrl: l.url, jobPortal: l.provider, jobDescription: l.description, status: "saved", salaryText: l.salary_text },
    { jobListingId: l.id },
  );
}

/** Runs due job alerts and notifies about new high-matching listings. */
export async function runJobAlerts(db: Database, userId: string) {
  const alerts = await db.withUser(userId, (tx) =>
    tx.query(
      `select * from job_alerts where active and (last_run_at is null or
         (frequency = 'instant' and last_run_at < now() - interval '1 hour') or
         (frequency = 'daily' and last_run_at < now() - interval '20 hours') or
         (frequency = 'weekly' and last_run_at < now() - interval '6 days'))`,
    ),
  );
  let notified = 0;
  for (const a of alerts) {
    const before = new Date();
    await discoverJobs(db, userId, { keywords: a.keywords, location: a.location });
    await db.withUser(userId, async (tx) => {
      const fresh = await tx.query("select id, title, company, match_score from job_listings where fetched_at >= $1 and created_at >= $1 and match_score >= 60 order by match_score desc limit 5", [before.toISOString()]);
      if (fresh.length) {
        await notify(tx, userId, {
          type: "new_matching_job",
          title: `${fresh.length} new match${fresh.length > 1 ? "es" : ""} for "${a.name}"`,
          body: fresh.map((f) => `${f.title}${f.company ? ` · ${f.company}` : ""}`).join("\n"),
          link: "/app/discover",
          dedupeKey: `alert:${a.id}:${before.toISOString().slice(0, 13)}`,
        });
        notified++;
      }
      await tx.query("update job_alerts set last_run_at = now() where id = $1", [a.id]);
    });
  }
  return { alerts: alerts.length, notified };
}

/** Opens a portal search with the user's keywords (no portal credentials are ever stored). */
export function portalSearchUrl(template: string | null, base: string, keywords: string, location: string) {
  if (!template) return base;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return template
    .replace("{q}", encodeURIComponent(keywords))
    .replace("{l}", encodeURIComponent(location))
    .replace("{qs}", slug(keywords))
    .replace("{ls}", slug(location));
}
