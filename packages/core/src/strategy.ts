/**
 * ENGINE C — Career Strategy.
 * Turns stored outcomes into metrics and evidence-backed recommendations.
 * No speculative probabilities: every number is a count or ratio of the user's own records.
 */
import { INTERVIEW_STATUSES, OFFER_STATUSES, RESPONDED_STATUSES, normalizeRole, strategyNarrativeSchema, tokenSimilarity } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { getCareerContext } from "./career-memory";
import { skillGapAnalysis } from "./skills";

const list = (a: readonly string[]) => `array[${a.map((s) => `'${s}'`).join(",")}]::text[]`;

export interface Metrics {
  range: { from: string | null; to: string | null };
  saved: number;
  submitted: number;
  responded: number;
  interviews: number;
  offers: number;
  rejections: number;
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  avgResponseDays: number | null;
  definitions: Record<string, string>;
  byPlatform: { key: string; submitted: number; responded: number; interviews: number }[];
  byRole: { key: string; submitted: number; responded: number; interviews: number }[];
  byLocation: { key: string; submitted: number; responded: number }[];
  weekly: { week: string; submitted: number }[];
  statusBreakdown: { status: string; n: number }[];
  resumeVersions: { tailored: { submitted: number; responded: number }; untailored: { submitted: number; responded: number }; distinctVersions: number };
  practice: { mockInterviews: number; scenarios: number; modulesDone: number; exercises: number; exercisesCorrect: number };
}

export async function computeMetrics(tx: Tx, range: { from?: string | null; to?: string | null } = {}): Promise<Metrics> {
  const params: unknown[] = [range.from ?? null, range.to ?? null];
  const base = `from applications a where not a.archived
    and ($1::timestamptz is null or coalesce(a.applied_at, a.confirmation_received_at, a.created_at) >= $1::timestamptz)
    and ($2::timestamptz is null or coalesce(a.applied_at, a.confirmation_received_at, a.created_at) < ($2::date + 1))`;
  const reached = (statuses: readonly string[]) =>
    `(a.status = any(${list(statuses)}) or exists (select 1 from status_history h where h.application_id = a.id and h.to_status = any(${list(statuses)})))`;
  const submittedCond = "a.status not in ('saved','preparing')";
  const respondedCond = `(${reached(RESPONDED_STATUSES)} or exists (select 1 from application_events e where e.application_id = a.id and e.type in ('recruiter_reply','assessment_assigned','interview_requested','rejection_received','offer_received')))`;
  const totals = await tx.one(
    `select count(*) filter (where a.status in ('saved','preparing'))::int as saved,
            count(*) filter (where ${submittedCond})::int as submitted,
            count(*) filter (where ${submittedCond} and ${respondedCond})::int as responded,
            count(*) filter (where ${submittedCond} and ${reached(INTERVIEW_STATUSES)})::int as interviews,
            count(*) filter (where ${submittedCond} and ${reached(OFFER_STATUSES)})::int as offers,
            count(*) filter (where a.status = 'rejected')::int as rejections
     ${base}`,
    params,
  );
  const avg = await tx.one(
    `select avg(extract(epoch from (r.first_at - coalesce(a.applied_at, a.confirmation_received_at, a.created_at))) / 86400)::float as days
     from applications a
     cross join lateral (select min(e.occurred_at) as first_at from application_events e where e.application_id = a.id
       and e.type in ('recruiter_reply','assessment_assigned','interview_requested','rejection_received','offer_received')) r
     where r.first_at is not null and not a.archived and ${submittedCond}
       and ($1::timestamptz is null or coalesce(a.applied_at, a.confirmation_received_at, a.created_at) >= $1::timestamptz)
       and ($2::timestamptz is null or coalesce(a.applied_at, a.confirmation_received_at, a.created_at) < ($2::date + 1))`,
    params,
  );
  const group = async (expr: string) =>
    tx.query<{ key: string; submitted: number; responded: number; interviews: number }>(
      `select coalesce(${expr}, 'Unknown') as key, count(*)::int as submitted,
              count(*) filter (where ${respondedCond})::int as responded,
              count(*) filter (where ${reached(INTERVIEW_STATUSES)})::int as interviews
       ${base} and ${submittedCond} group by 1 order by 2 desc limit 12`,
      params,
    );
  const byPlatform = await group("nullif(a.job_portal,'')");
  const byRoleRaw = await group("a.role_title");
  // Merge similar role titles ("Sr. Business Analyst" ~ "Business Analyst")
  const byRole: typeof byRoleRaw = [];
  for (const r of byRoleRaw) {
    const k = normalizeRole(r.key) || r.key;
    const hit = byRole.find((x) => tokenSimilarity(normalizeRole(x.key), k) >= 0.75);
    if (hit) {
      hit.submitted += r.submitted;
      hit.responded += r.responded;
      hit.interviews += r.interviews;
    } else byRole.push({ ...r });
  }
  const byLocation = await tx.query<{ key: string; submitted: number; responded: number }>(
    `select coalesce(nullif(split_part(a.location, ',', 1),''), 'Unknown') as key, count(*)::int as submitted, count(*) filter (where ${respondedCond})::int as responded
     ${base} and ${submittedCond} group by 1 order by 2 desc limit 10`,
    params,
  );
  const weekly = await tx.query<{ week: string; submitted: number }>(
    `select to_char(date_trunc('week', coalesce(a.applied_at, a.confirmation_received_at, a.created_at)), 'YYYY-MM-DD') as week, count(*)::int as submitted
     ${base} and ${submittedCond} group by 1 order by 1`,
    params,
  );
  const statusBreakdown = await tx.query<{ status: string; n: number }>(`select a.status, count(*)::int as n ${base} group by 1 order by 2 desc`, params);
  const rv = await tx.one(
    `select count(*) filter (where a.resume_version_id is not null)::int as t_sub,
            count(*) filter (where a.resume_version_id is not null and ${respondedCond})::int as t_resp,
            count(*) filter (where a.resume_version_id is null)::int as u_sub,
            count(*) filter (where a.resume_version_id is null and ${respondedCond})::int as u_resp,
            count(distinct a.resume_version_id)::int as versions
     ${base} and ${submittedCond}`,
    params,
  );
  const practice = await tx.one(
    `select (select count(*)::int from mock_interview_sessions where status = 'completed') as mocks,
            (select count(*)::int from scenario_attempts) as scenarios,
            (select count(*)::int from learning_modules where completed_at is not null) as modules,
            (select count(*)::int from skill_progress where activity_type = 'exercise') as ex,
            (select count(*)::int from skill_progress where activity_type = 'exercise' and correct) as ex_ok`,
  );
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
  return {
    range: { from: range.from ?? null, to: range.to ?? null },
    saved: totals!.saved,
    submitted: totals!.submitted,
    responded: totals!.responded,
    interviews: totals!.interviews,
    offers: totals!.offers,
    rejections: totals!.rejections,
    responseRate: rate(totals!.responded, totals!.submitted),
    interviewRate: rate(totals!.interviews, totals!.submitted),
    offerRate: rate(totals!.offers, totals!.submitted),
    avgResponseDays: avg?.days != null ? Math.round(avg.days * 10) / 10 : null,
    definitions: {
      submitted: "Applications past 'Saved'/'Preparing' (you applied).",
      responseRate: "Submitted applications with any employer response (reply, assessment, interview, rejection or offer) ÷ submitted applications.",
      interviewRate: "Submitted applications that reached any interview stage ÷ submitted applications.",
      offerRate: "Submitted applications that reached an offer ÷ submitted applications.",
      avgResponseDays: "Average days from application (or confirmation email) to the first employer response, for applications that got one.",
    },
    byPlatform,
    byRole: byRole.slice(0, 10),
    byLocation,
    weekly,
    statusBreakdown,
    resumeVersions: { tailored: { submitted: rv!.t_sub, responded: rv!.t_resp }, untailored: { submitted: rv!.u_sub, responded: rv!.u_resp }, distinctVersions: rv!.versions },
    practice: { mockInterviews: practice!.mocks, scenarios: practice!.scenarios, modulesDone: practice!.modules, exercises: practice!.ex, exercisesCorrect: practice!.ex_ok },
  };
}

export interface Recommendation {
  kind: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  link?: string;
}

const MIN_SAMPLE = 5;

export async function buildRecommendations(tx: Tx): Promise<Recommendation[]> {
  const m = await computeMetrics(tx);
  const ctx = await getCareerContext(tx);
  const recs: Recommendation[] = [];

  const stale = await tx.query("select id, company, role_title, last_activity_at from applications where not archived and status in ('applied','acknowledged','under_review') and last_activity_at < now() - interval '10 days' order by last_activity_at limit 10");
  if (stale.length)
    recs.push({ kind: "follow_up", title: `Follow up on ${stale.length} application${stale.length > 1 ? "s" : ""}`, detail: `No activity for 10+ days: ${stale.slice(0, 4).map((s) => s.company).join(", ")}${stale.length > 4 ? "…" : ""}. Silence is not a rejection; a polite follow-up is reasonable.`, evidence: { applications: stale.map((s) => ({ id: s.id, company: s.company, lastActivity: s.last_activity_at })) }, link: "/app/applications?status=active" });

  const platforms = m.byPlatform.filter((p) => p.submitted >= MIN_SAMPLE && p.key !== "Unknown");
  if (platforms.length >= 2) {
    const sorted = [...platforms].sort((a, b) => b.responded / b.submitted - a.responded / a.submitted);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = best.responded / best.submitted - worst.responded / worst.submitted;
    if (gap >= 0.15)
      recs.push({ kind: "source", title: `${best.key} is getting you more responses`, detail: `${best.responded}/${best.submitted} responses on ${best.key} vs ${worst.responded}/${worst.submitted} on ${worst.key}. Consider spending more search time on ${best.key}. Small samples can change quickly.`, evidence: { best, worst } });
  }
  const dead = m.byPlatform.find((p) => p.submitted >= 8 && p.responded === 0 && p.key !== "Unknown");
  if (dead) recs.push({ kind: "source", title: `No responses yet from ${dead.key}`, detail: `${dead.submitted} applications through ${dead.key} and no responses so far. Check whether listings there are fresh and well matched.`, evidence: { platform: dead } });

  const roles = m.byRole.filter((r) => r.submitted >= 3);
  const bestRole = [...roles].sort((a, b) => b.interviews / b.submitted - a.interviews / a.submitted)[0];
  if (bestRole && bestRole.interviews > 0)
    recs.push({ kind: "role_focus", title: `"${bestRole.key}" roles convert best to interviews`, detail: `${bestRole.interviews} of ${bestRole.submitted} reached an interview. This is your own data, not a market prediction.`, evidence: { role: bestRole } });

  const gaps = await skillGapAnalysis(tx);
  const topGap = gaps.gaps.find((g) => g.count >= 3);
  if (topGap)
    recs.push({ kind: "skill", title: `Build evidence for ${topGap.skill}`, detail: `${topGap.skill} appears in ${topGap.source} but is not in your verified skills. If you already have it, verify it in your profile; otherwise it is a good next skill.`, evidence: { gap: topGap }, link: "/app/skills" });

  const upcoming = await tx.query("select i.id, i.scheduled_at, a.company, a.id as app_id from interviews i join applications a on a.id = i.application_id where i.status in ('scheduled','rescheduled') and i.scheduled_at between now() and now() + interval '7 days'");
  for (const u of upcoming) {
    const practiced = await tx.one("select 1 from mock_interview_sessions where application_id = $1 and status = 'completed'", [u.app_id]);
    if (!practiced) recs.push({ kind: "interview_prep", title: `Prepare for ${u.company}`, detail: `Interview on ${new Date(u.scheduled_at).toDateString()} and no mock interview done for it yet. Try Interview Tomorrow mode.`, evidence: { interview: u }, link: `/app/interview?application=${u.app_id}` });
  }
  const weak = await tx.query("select topic, source from weaknesses where status = 'open' order by updated_at desc limit 3");
  if (weak.length) recs.push({ kind: "practice", title: `Practise: ${weak.map((w) => w.topic).join(", ")}`, detail: "These came up in your interview reviews or practice and are still open.", evidence: { weaknesses: weak }, link: "/app/interview" });

  const { tailored, untailored } = m.resumeVersions;
  if (tailored.submitted >= MIN_SAMPLE && untailored.submitted >= MIN_SAMPLE) {
    const tr = tailored.responded / tailored.submitted;
    const ur = untailored.responded / untailored.submitted;
    if (tr - ur >= 0.1)
      recs.push({ kind: "resume", title: "Tailored resumes are getting more responses", detail: `${Math.round(tr * 100)}% response with tailored resumes (${tailored.submitted} apps) vs ${Math.round(ur * 100)}% without (${untailored.submitted} apps).`, evidence: { tailored, untailored } });
  } else if (m.submitted >= 3) {
    recs.push({ kind: "resume", title: "Not enough data on resume tailoring yet", detail: `Mark which resume version you submitted for each application. After ${MIN_SAMPLE}+ tailored and ${MIN_SAMPLE}+ untailored applications, CareerFlow can compare their response rates.`, evidence: { tailored, untailored } });
  }

  if (ctx.profile.avoidRoles.length) {
    const apps = await tx.query("select id, company, role_title from applications where status not in ('rejected','withdrawn') and created_at > now() - interval '60 days'");
    const leak = apps.filter((a) => ctx.profile.avoidRoles.some((r) => tokenSimilarity(r, a.role_title) >= 0.5));
    if (leak.length) recs.push({ kind: "role_focus", title: `${leak.length} application(s) look like roles you want to avoid`, detail: `${leak.slice(0, 3).map((l) => `${l.role_title} at ${l.company}`).join("; ")}.`, evidence: { applications: leak } });
  }

  const week = await tx.one<{ this: number; last: number }>(
    `select count(*) filter (where coalesce(applied_at, created_at) >= date_trunc('week', now()))::int as this,
            count(*) filter (where coalesce(applied_at, created_at) >= date_trunc('week', now()) - interval '7 days' and coalesce(applied_at, created_at) < date_trunc('week', now()))::int as last
     from applications where status not in ('saved','preparing')`,
  );
  const saved = await tx.one<{ n: number }>("select count(*)::int as n from applications where status in ('saved','preparing') and not archived");
  if ((saved?.n ?? 0) >= 3) recs.push({ kind: "activity", title: `${saved!.n} saved jobs are waiting`, detail: `This week: ${week?.this ?? 0} applications (last week ${week?.last ?? 0}). Review saved jobs before they close.`, evidence: { saved: saved!.n, week }, link: "/app/saved" });
  return recs;
}

/** Recomputes and stores recommendations; optionally adds an AI narrative summary over metrics only. */
export async function refreshStrategy(db: Database, userId: string) {
  const { recs, metrics } = await db.withUser(userId, async (tx) => {
    const recs = await buildRecommendations(tx);
    await tx.query("delete from career_recommendations where dismissed_at is null");
    for (const r of recs) await tx.query("insert into career_recommendations (user_id, kind, title, detail, evidence) values ($1,$2,$3,$4,$5::jsonb)", [userId, r.kind, r.title, r.detail, JSON.stringify({ ...r.evidence, link: r.link ?? null })]);
    return { recs, metrics: await computeMetrics(tx) };
  });
  let narrative: { summary: string; focus: string[] } | null = null;
  const ai = aiFor(db, userId);
  if (ai && metrics.submitted >= 3) {
    try {
      const { data } = await ai.generateJson({
        feature: "strategy.narrative",
        userId,
        schema: strategyNarrativeSchema,
        system: "Summarise a job seeker's search progress from their own metrics and rule-based recommendations. Use only these numbers. No hiring probabilities. Practical, encouraging, specific.",
        prompt: JSON.stringify({ metrics: { ...metrics, weekly: metrics.weekly.slice(-8) }, recommendations: recs.map((r) => ({ title: r.title, detail: r.detail })) }),
        temperature: 0.3,
      });
      narrative = data;
    } catch {
      narrative = null;
    }
  }
  return { recs, metrics, narrative };
}
