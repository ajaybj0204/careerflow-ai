import { untrusted } from "@careerflow/ai";
import { companyResearchSchema, outreachDraftSchema, profileSuggestionSchema } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor, requireAI } from "./ai";
import { getCareerContext, renderCareerContext } from "./career-memory";

// ---------------------------------------------------------------------------
// Company research from reputable public sources (Wikipedia API + optional AI with Google Search grounding)
// ---------------------------------------------------------------------------
async function wikipedia(name: string) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(name + " company")}`, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "CareerFlowAI/0.1" } });
    const [, titles] = (await s.json()) as [string, string[]];
    const title = titles?.[0];
    if (!title) return null;
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "CareerFlowAI/0.1" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (j.type === "disambiguation") return null;
    return { title: j.title as string, extract: j.extract as string, url: j.content_urls?.desktop?.page as string, description: j.description as string | undefined };
  } catch {
    return null;
  }
}

export async function researchCompany(db: Database, userId: string, input: { name: string; website?: string | null }) {
  const sources: { title: string; url: string; retrievedAt: string; kind: string }[] = [];
  const now = new Date().toISOString();
  const wiki = await wikipedia(input.name);
  let summary = wiki?.extract ?? null;
  let industry: string | null = wiki?.description ?? null;
  let products: string | null = null;
  let topics: string[] = [];
  let news: { title: string; date: string | null; url: string | null }[] = [];
  if (wiki) sources.push({ title: `Wikipedia: ${wiki.title}`, url: wiki.url, retrievedAt: now, kind: "encyclopedia" });
  const ai = aiFor(db, userId);
  let grounded = false;
  if (ai) {
    try {
      const r = await ai.generateJson({
        feature: "company.research",
        userId,
        schema: companyResearchSchema,
        grounding: true,
        system: "Research a company for a job seeker in India using web search. Cite only what sources say. recentNews must be real articles with dates and URLs from the search results; leave it empty if none. interviewTopics: what candidates should prepare, based on the company's business.",
        prompt: `Company: ${input.name}${input.website ? ` (website: ${input.website})` : ""}`,
        temperature: 0.2,
      });
      summary = r.data.overview || summary;
      industry = r.data.industry ?? industry;
      products = r.data.products;
      topics = r.data.interviewTopics;
      news = r.data.recentNews.filter((n) => n.url && r.sources.some((s) => s.url === n.url || s.title.includes(new URL(n.url!).hostname.replace(/^www\./, ""))));
      for (const s of r.sources) sources.push({ title: s.title, url: s.url, retrievedAt: now, kind: "web search" });
      grounded = true;
    } catch {
      /* keep public-API data */
    }
  }
  const row = await db.withUser(userId, (tx) =>
    tx.one<{ id: string }>(
      `insert into companies (user_id, name, website, industry, summary, products, interview_topics, sources, researched_at)
       values ($1,$2,$3,$4,$5,$6,$7::text[],$8::jsonb,now())
       on conflict (user_id, lower(name)) do update set website = coalesce(excluded.website, companies.website), industry = excluded.industry, summary = excluded.summary,
         products = excluded.products, interview_topics = excluded.interview_topics, sources = excluded.sources, researched_at = now()
       returning id`,
      [userId, input.name, input.website ?? null, industry, summary, products, topics, JSON.stringify({ list: sources, news })],
    ),
  );
  return { id: row!.id, summary, industry, products, topics, news, sources, grounded };
}

// ---------------------------------------------------------------------------
// Recruiter communication drafts (never sent automatically)
// ---------------------------------------------------------------------------
export const OUTREACH_KINDS: Record<string, string> = {
  referral_request: "Referral request",
  recruiter_intro: "Recruiter introduction",
  linkedin_connection: "LinkedIn connection note (≤300 characters)",
  follow_up: "Application follow-up",
  interview_confirmation: "Interview confirmation",
  thank_you: "Thank-you email after interview",
  assessment_clarification: "Assessment clarification",
  salary_negotiation: "Salary negotiation email",
  offer_acceptance: "Offer acceptance",
  offer_decline: "Offer decline",
};

function template(kind: string, v: { name: string; company: string; role: string; recruiter: string; skills: string; headline: string }) {
  const hi = `Hi ${v.recruiter || "there"},`;
  const sign = `\n\nBest regards,\n${v.name}`;
  const t: Record<string, { subject: string | null; body: string }> = {
    referral_request: { subject: `Referral request – ${v.role} at ${v.company}`, body: `${hi}\n\nI hope you are well. I am applying for the ${v.role} role at ${v.company} and would be grateful if you could consider referring me. My background: ${v.headline}. Key skills: ${v.skills}.\n\nI am happy to share my resume and the job link. Thank you for your time.${sign}` },
    recruiter_intro: { subject: `${v.role} – ${v.name}`, body: `${hi}\n\nI came across the ${v.role} opening at ${v.company} and believe my experience fits well: ${v.headline}. Key skills: ${v.skills}.\n\nCould we have a short conversation about the role?${sign}` },
    linkedin_connection: { subject: null, body: `Hi ${v.recruiter || ""}, I'm interested in the ${v.role} role at ${v.company}. ${v.headline}. Would love to connect.`.slice(0, 300) },
    follow_up: { subject: `Following up – ${v.role} application`, body: `${hi}\n\nI applied for the ${v.role} position at ${v.company} and wanted to follow up on my application. I remain very interested and would be glad to share anything else you need.${sign}` },
    interview_confirmation: { subject: `Interview confirmation – ${v.role}`, body: `${hi}\n\nThank you for the invitation. I confirm my availability for the interview for the ${v.role} role at ${v.company} at the proposed time. Please let me know if anything is needed from my side.${sign}` },
    thank_you: { subject: `Thank you – ${v.role} interview`, body: `${hi}\n\nThank you for taking the time to speak with me about the ${v.role} role at ${v.company}. I enjoyed learning more about the team, and the conversation strengthened my interest in the role.${sign}` },
    assessment_clarification: { subject: `Question about the assessment – ${v.role}`, body: `${hi}\n\nThank you for sharing the assessment for the ${v.role} role. Could you please clarify [your question] before I begin?${sign}` },
    salary_negotiation: { subject: `Offer discussion – ${v.role}`, body: `${hi}\n\nThank you for the offer for the ${v.role} role at ${v.company}. I am excited about the opportunity. Based on my experience and the role's scope, I would like to discuss the fixed compensation. Would there be flexibility to revise it to [your researched figure]?${sign}` },
    offer_acceptance: { subject: `Offer acceptance – ${v.role}`, body: `${hi}\n\nI am pleased to accept the offer for the ${v.role} position at ${v.company}. Please let me know the next steps for documentation and onboarding.${sign}` },
    offer_decline: { subject: `Regarding the ${v.role} offer`, body: `${hi}\n\nThank you for the offer for the ${v.role} role at ${v.company}. After careful thought, I have decided not to accept it. I appreciate your time and hope our paths cross again.${sign}` },
  };
  return t[kind] ?? t.follow_up;
}

/** Drafts a message from the real application context. It is saved as a draft; the user sends it themselves. */
export async function draftOutreach(db: Database, userId: string, input: { kind: string; applicationId?: string | null; recruiterId?: string | null; notes?: string | null }) {
  if (!OUTREACH_KINDS[input.kind]) throw new Error("Unknown message type");
  const data = await db.withUser(userId, async (tx) => ({
    ctx: await getCareerContext(tx),
    app: input.applicationId ? await tx.one("select company, role_title, job_description from applications where id = $1", [input.applicationId]) : null,
    rec: input.recruiterId ? await tx.one("select name, company, email from recruiter_contacts where id = $1", [input.recruiterId]) : null,
    interview: input.applicationId ? await tx.one("select scheduled_at, round_type from interviews where application_id = $1 order by scheduled_at desc nulls last limit 1", [input.applicationId]) : null,
  }));
  const vars = {
    name: data.ctx.profile.fullName ?? "",
    company: data.app?.company ?? data.rec?.company ?? "your company",
    role: data.app?.role_title ?? "the role",
    recruiter: data.rec?.name?.split(" ")[0] ?? "",
    skills: data.ctx.skills.slice(0, 5).map((s) => s.name).join(", "),
    headline: data.ctx.profile.headline ?? (data.ctx.employment[0] ? `${data.ctx.employment[0].title} at ${data.ctx.employment[0].company}` : ""),
  };
  let draft = template(input.kind, vars);
  let method: "template" | "ai" = "template";
  const ai = aiFor(db, userId);
  if (ai) {
    try {
      const r = await ai.generateJson({
        feature: "outreach.draft",
        userId,
        schema: outreachDraftSchema,
        system: `Write a ${OUTREACH_KINDS[input.kind]} for the candidate. Short, polite, specific to the application, Indian English. Only facts from <career_context>. ${input.kind === "linkedin_connection" ? "Maximum 300 characters, subject null." : "Include a subject line."} Use square-bracket placeholders only for information you do not have.`,
        prompt: [renderCareerContext(data.ctx, { includeCompensation: input.kind === "salary_negotiation" }), `Company: ${vars.company}\nRole: ${vars.role}\nRecipient: ${data.rec?.name ?? "unknown"}`, data.interview ? `Interview: ${data.interview.round_type} on ${data.interview.scheduled_at ?? "date not set"}` : "", input.notes ? untrusted("user_notes", input.notes, 1000) : ""].join("\n\n"),
        temperature: 0.6,
      });
      draft = r.data;
      method = "ai";
    } catch {
      /* use template */
    }
  }
  const row = await db.withUser(userId, (tx) =>
    tx.one<{ id: string }>("insert into outreach_drafts (user_id, application_id, recruiter_id, kind, subject, body) values ($1,$2,$3,$4,$5,$6) returning id", [
      userId,
      input.applicationId ?? null,
      input.recruiterId ?? null,
      input.kind,
      draft.subject,
      draft.body,
    ]),
  );
  return { id: row!.id, ...draft, method, to: data.rec?.email ?? null };
}

export function gmailComposeUrl(to: string | null, subject: string | null, body: string) {
  const p = new URLSearchParams({ view: "cm", fs: "1", body });
  if (to) p.set("to", to);
  if (subject) p.set("su", subject);
  return `https://mail.google.com/mail/?${p}`;
}

// ---------------------------------------------------------------------------
// LinkedIn / portfolio optimisation (suggestions only; nothing is changed on external accounts)
// ---------------------------------------------------------------------------
export async function linkedinSuggestions(db: Database, userId: string) {
  const ctx = await db.withUser(userId, (tx) => getCareerContext(tx));
  const ai = aiFor(db, userId);
  if (!ai) {
    const top = ctx.skills.slice(0, 4).map((s) => s.name);
    const cur = ctx.employment[0];
    return {
      method: "template" as const,
      headline: [ctx.profile.targetRoles[0], cur ? `${cur.title} at ${cur.company}` : null, top.join(" · ")].filter(Boolean).join(" | ").slice(0, 220),
      about: [ctx.profile.summary, ctx.employment.length ? `Experience: ${ctx.employment.map((e) => `${e.title} at ${e.company}`).join("; ")}.` : null, top.length ? `Skills: ${ctx.skills.map((s) => s.name).join(", ")}.` : null, ctx.profile.careerGoals ? `Looking for: ${ctx.profile.careerGoals}` : null]
        .filter(Boolean)
        .join("\n\n"),
      experienceRewrites: [],
      skillsToFeature: top,
      projectBlurbs: ctx.projects.map((p) => ({ project: p.name, text: `${p.name}: ${p.description ?? ""}${p.tech.length ? ` Built with ${p.tech.join(", ")}.` : ""}` })),
    };
  }
  const { data } = await ai.generateJson({
    feature: "linkedin.optimize",
    userId,
    schema: profileSuggestionSchema,
    system: "Suggest LinkedIn profile text (headline ≤220 characters, About section, experience descriptions, featured skills, project blurbs) using only verified facts. Copy-ready, first person for About, no exaggeration.",
    prompt: renderCareerContext(ctx),
    temperature: 0.5,
  });
  return { method: "ai" as const, ...data };
}

// ---------------------------------------------------------------------------
// Daily Career Action Plan
// ---------------------------------------------------------------------------
export async function dailyPlan(tx: Tx) {
  const [followUps, replies, assessments, interviews, saved, tasks, modules, review, jobs] = await Promise.all([
    tx.query("select id, company, role_title, last_activity_at from applications where not archived and status in ('applied','acknowledged','under_review') and last_activity_at < now() - interval '10 days' order by last_activity_at limit 5"),
    tx.query("select n.* from notifications n where n.type = 'recruiter_reply' and n.read_at is null order by created_at desc limit 5"),
    tx.query("select s.*, a.company from assessments s left join applications a on a.id = s.application_id where s.status = 'pending' order by s.deadline nulls last limit 5"),
    tx.query("select i.*, a.company, a.role_title from interviews i left join applications a on a.id = i.application_id where i.status in ('requested','scheduled','rescheduled') and (i.scheduled_at is null or i.scheduled_at >= now() - interval '2 hours') order by i.scheduled_at nulls last limit 5"),
    tx.query("select id, company, role_title, created_at from applications where status in ('saved','preparing') and not archived order by created_at desc limit 5"),
    tx.query("select * from tasks where done_at is null order by due_at nulls last limit 8"),
    tx.query("select m.*, p.title as path_title from learning_modules m join learning_paths p on p.id = m.path_id where m.completed_at is null and p.status = 'active' order by p.created_at, m.day, m.sort_order limit 3"),
    tx.one<{ n: number }>("select count(*)::int as n from review_queue where status = 'open'"),
    tx.query("select id, title, company, match_score, posted_at from job_listings where not dismissed and match_score >= 55 and created_at > now() - interval '3 days' order by match_score desc limit 5"),
  ]);
  return { followUps, replies, assessments, interviews, saved, tasks, modules, reviewCount: review?.n ?? 0, jobs };
}

export async function calendarItems(tx: Tx, from: Date, to: Date) {
  const [interviews, assessments, tasks, events] = await Promise.all([
    tx.query("select i.id, i.scheduled_at as at, 'interview' as kind, coalesce(a.company,'Interview') || ' — ' || i.round_type as title, i.application_id from interviews i left join applications a on a.id = i.application_id where i.scheduled_at between $1 and $2", [from.toISOString(), to.toISOString()]),
    tx.query("select s.id, s.deadline as at, 'assessment' as kind, s.title, s.application_id from assessments s where s.deadline between $1 and $2", [from.toISOString(), to.toISOString()]),
    tx.query("select t.id, t.due_at as at, 'task' as kind, t.title, t.application_id from tasks t where t.due_at between $1 and $2 and t.done_at is null", [from.toISOString(), to.toISOString()]),
    tx.query("select e.id, e.starts_at as at, 'event' as kind, e.title, e.application_id from calendar_events e where e.starts_at between $1 and $2", [from.toISOString(), to.toISOString()]),
  ]);
  return [...interviews, ...assessments, ...tasks, ...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export async function activitySummary(tx: Tx, days: number) {
  return tx.one(
    `select (select count(*)::int from applications where coalesce(applied_at, created_at) > now() - ($1 || ' days')::interval and status not in ('saved','preparing')) as applied,
            (select count(*)::int from applications where created_at > now() - ($1 || ' days')::interval and status in ('saved','preparing')) as saved,
            (select count(*)::int from application_events where occurred_at > now() - ($1 || ' days')::interval and type in ('recruiter_reply','interview_requested','assessment_assigned')) as responses,
            (select count(*)::int from interviews where created_at > now() - ($1 || ' days')::interval) as interviews,
            (select count(*)::int from skill_progress where completed_at > now() - ($1 || ' days')::interval) as practice,
            (select count(*)::int from application_events where occurred_at > now() - ($1 || ' days')::interval and type = 'rejection_received') as rejections`,
    [String(days)],
  );
}
