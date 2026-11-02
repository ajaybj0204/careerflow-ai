/**
 * ENGINE A — Career Memory.
 * The user's verified professional knowledge base, shared by every AI feature.
 * Only facts with verified = true are given to AI as true. Extracted / suggested facts wait for confirmation.
 */
import { canonicalSkill, type ParsedResume } from "@careerflow/shared";
import type { Tx } from "@careerflow/database";

export interface CareerContext {
  profile: {
    fullName: string | null;
    email: string | null;
    userType: string;
    headline: string | null;
    summary: string | null;
    location: string | null;
    yearsExperience: number | null;
    currentCtcLpa: number | null;
    expectedCtcMinLpa: number | null;
    expectedCtcMaxLpa: number | null;
    noticePeriodDays: number | null;
    targetRoles: string[];
    avoidRoles: string[];
    preferredLocations: string[];
    workModes: string[];
    careerGoals: string | null;
    links: { linkedin: string | null; github: string | null; portfolio: string | null };
  };
  employment: { company: string; title: string; location: string | null; start: string | null; end: string | null; current: boolean; bullets: string[]; description: string | null }[];
  education: { institution: string; degree: string | null; field: string | null; endYear: number | null; grade: string | null }[];
  skills: { name: string; level: string | null; years: number | null }[];
  certifications: { name: string; issuer: string | null }[];
  /** Completed, verified projects only. In-progress work and ideas are listed separately and never used as experience. */
  projects: { name: string; description: string | null; tech: string[]; highlights: string[]; url: string | null }[];
  inProgressProjects: string[];
  achievements: { description: string; metric: string | null }[];
  approvedAnswers: { question: string; answer: string }[];
  pendingReview: number;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 7) : null);

export async function getCareerContext(tx: Tx, opts: { includeAnswers?: boolean } = {}): Promise<CareerContext> {
  const [p, cp] = await Promise.all([tx.one("select * from profiles limit 1"), tx.one("select * from career_profiles limit 1")]);
  const [emp, edu, skills, certs, projects, ach, pending] = await Promise.all([
    tx.query("select * from employment_history where verified order by is_current desc, start_date desc nulls last, sort_order"),
    tx.query("select * from education where verified order by end_year desc nulls last"),
    tx.query("select * from verified_skills where verified order by name"),
    tx.query("select * from certifications where verified order by issued_on desc nulls last"),
    tx.query("select * from portfolio_projects where verified order by created_at desc"),
    tx.query("select * from verified_achievements where verified"),
    tx.one<{ n: number }>(
      `select (select count(*) from employment_history where not verified) + (select count(*) from education where not verified)
        + (select count(*) from verified_skills where not verified) + (select count(*) from certifications where not verified)
        + (select count(*) from portfolio_projects where not verified) + (select count(*) from verified_achievements where not verified) as n`,
    ),
  ]);
  const answers = opts.includeAnswers ? await tx.query("select question, answer from approved_answers order by updated_at desc limit 25") : [];
  return {
    profile: {
      fullName: p?.full_name ?? null,
      email: p?.email ?? null,
      userType: p?.user_type ?? "experienced",
      headline: cp?.headline ?? null,
      summary: cp?.summary ?? null,
      location: cp?.location ?? null,
      yearsExperience: num(cp?.years_experience),
      currentCtcLpa: num(cp?.current_ctc_lpa),
      expectedCtcMinLpa: num(cp?.expected_ctc_min_lpa),
      expectedCtcMaxLpa: num(cp?.expected_ctc_max_lpa),
      noticePeriodDays: cp?.notice_period_days ?? null,
      targetRoles: cp?.target_roles ?? [],
      avoidRoles: cp?.avoid_roles ?? [],
      preferredLocations: cp?.preferred_locations ?? [],
      workModes: cp?.work_modes ?? [],
      careerGoals: cp?.career_goals ?? null,
      links: { linkedin: cp?.linkedin_url ?? null, github: cp?.github_url ?? null, portfolio: cp?.portfolio_url ?? null },
    },
    employment: emp.map((e) => ({ company: e.company, title: e.title, location: e.location, start: d(e.start_date), end: d(e.end_date), current: e.is_current, bullets: e.bullets ?? [], description: e.description })),
    education: edu.map((e) => ({ institution: e.institution, degree: e.degree, field: e.field, endYear: e.end_year, grade: e.grade })),
    skills: skills.map((s) => ({ name: s.name, level: s.level, years: num(s.years) })),
    certifications: certs.map((c) => ({ name: c.name, issuer: c.issuer })),
    projects: projects.filter((x) => x.status === "completed").map((x) => ({ name: x.name, description: x.description, tech: x.tech ?? [], highlights: x.highlights ?? [], url: x.url })),
    inProgressProjects: projects.filter((x) => x.status !== "completed").map((x) => `${x.name} (${x.status === "idea" ? "idea, not built" : "in progress"})`),
    achievements: ach.map((a) => ({ description: a.description, metric: a.metric })),
    approvedAnswers: answers.map((a) => ({ question: a.question, answer: a.answer })),
    pendingReview: Number(pending?.n ?? 0),
  };
}

/** Compact text form of the verified context for AI prompts. Only verified facts are included. */
export function renderCareerContext(c: CareerContext, opts: { includeCompensation?: boolean } = {}): string {
  const L: string[] = ["<career_context>", "Everything below is verified by the user and may be used as fact."];
  const p = c.profile;
  L.push(`Name: ${p.fullName ?? "unknown"}`);
  if (p.headline) L.push(`Headline: ${p.headline}`);
  if (p.location) L.push(`Location: ${p.location}`);
  if (p.yearsExperience !== null) L.push(`Total experience: ${p.yearsExperience} years`);
  L.push(`Career stage: ${p.userType}`);
  if (p.targetRoles.length) L.push(`Target roles: ${p.targetRoles.join(", ")}`);
  if (p.avoidRoles.length) L.push(`Roles to avoid: ${p.avoidRoles.join(", ")}`);
  if (p.careerGoals) L.push(`Career goals: ${p.careerGoals}`);
  if (p.summary) L.push(`Summary: ${p.summary}`);
  if (opts.includeCompensation) {
    if (p.currentCtcLpa !== null) L.push(`Current/last CTC: ₹${p.currentCtcLpa} LPA`);
    if (p.expectedCtcMinLpa !== null) L.push(`Expected CTC: ₹${p.expectedCtcMinLpa}${p.expectedCtcMaxLpa ? `–${p.expectedCtcMaxLpa}` : ""} LPA`);
    if (p.noticePeriodDays !== null) L.push(`Notice period: ${p.noticePeriodDays} days`);
  }
  if (c.employment.length) {
    L.push("", "Employment:");
    for (const e of c.employment) {
      L.push(`- ${e.title} at ${e.company} (${e.start ?? "?"} to ${e.current ? "present" : e.end ?? "?"})${e.location ? `, ${e.location}` : ""}`);
      for (const b of e.bullets) L.push(`  • ${b}`);
      if (e.description) L.push(`  ${e.description}`);
    }
  }
  if (c.education.length) {
    L.push("", "Education:");
    for (const e of c.education) L.push(`- ${[e.degree, e.field].filter(Boolean).join(", ")} — ${e.institution}${e.endYear ? ` (${e.endYear})` : ""}${e.grade ? `, ${e.grade}` : ""}`);
  }
  if (c.skills.length) L.push("", `Verified skills: ${c.skills.map((s) => s.name + (s.level ? ` (${s.level})` : "")).join(", ")}`);
  if (c.certifications.length) L.push(`Certifications: ${c.certifications.map((x) => x.name + (x.issuer ? ` — ${x.issuer}` : "")).join("; ")}`);
  if (c.projects.length) {
    L.push("", "Completed projects:");
    for (const x of c.projects) L.push(`- ${x.name}: ${x.description ?? ""}${x.tech.length ? ` [${x.tech.join(", ")}]` : ""}${x.highlights.length ? ` Highlights: ${x.highlights.join("; ")}` : ""}`);
  }
  if (c.inProgressProjects.length) L.push(`Not completed (never present as finished work): ${c.inProgressProjects.join("; ")}`);
  if (c.achievements.length) {
    L.push("", "Verified achievements:");
    for (const a of c.achievements) L.push(`- ${a.description}${a.metric ? ` (${a.metric})` : ""}`);
  }
  if (c.approvedAnswers.length) {
    L.push("", "Answers the user approved earlier:");
    for (const a of c.approvedAnswers.slice(0, 10)) L.push(`Q: ${a.question}\nA: ${a.answer}`);
  }
  L.push("</career_context>");
  return L.join("\n");
}

/** Allowed vocabulary for the fabrication guard: everything the user has verified or wrote themselves. */
export function allowedSkillSet(c: CareerContext): Set<string> {
  const s = new Set<string>();
  for (const k of c.skills) s.add(canonicalSkill(k.name).toLowerCase());
  for (const p of c.projects) for (const t of p.tech) s.add(canonicalSkill(t).toLowerCase());
  return s;
}

function toDate(s: string | null): string | null {
  if (!s) return null;
  const y = s.match(/(19|20)\d{2}/)?.[0];
  if (!y) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mi = months.findIndex((m) => s.toLowerCase().includes(m));
  const mm = s.match(/\b(\d{1,2})\/(?:19|20)\d{2}/)?.[1];
  const month = mi >= 0 ? mi + 1 : mm ? Number(mm) : 1;
  return `${y}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Stores facts extracted from a resume as UNVERIFIED (source = document_extracted).
 * They appear in the profile review screen for the user to confirm, edit or discard.
 */
export async function importExtractedFacts(tx: Tx, userId: string, parsed: ParsedResume, documentId: string) {
  let added = 0;
  for (const [i, e] of parsed.employment.entries()) {
    const exists = await tx.one("select id from employment_history where lower(company) = lower($1) and lower(title) = lower($2)", [e.company, e.title]);
    if (exists) continue;
    await tx.query(
      `insert into employment_history (user_id, company, title, location, start_date, end_date, is_current, bullets, source, verified, source_document_id, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8::text[],'document_extracted',false,$9,$10)`,
      [userId, e.company.slice(0, 200), e.title.slice(0, 200), e.location, toDate(e.startDate), e.isCurrent ? null : toDate(e.endDate), e.isCurrent, e.bullets.slice(0, 20), documentId, i],
    );
    added++;
  }
  for (const e of parsed.education) {
    const exists = await tx.one("select id from education where lower(institution) = lower($1)", [e.institution]);
    if (exists) continue;
    await tx.query(
      "insert into education (user_id, institution, degree, field, end_year, grade, source, verified, source_document_id) values ($1,$2,$3,$4,$5,$6,'document_extracted',false,$7)",
      [userId, e.institution.slice(0, 200), e.degree, e.field, e.endYear, e.grade, documentId],
    );
    added++;
  }
  for (const raw of parsed.skills) {
    const name = canonicalSkill(raw).slice(0, 80);
    if (!name) continue;
    const r = await tx.query(
      "insert into verified_skills (user_id, name, source, verified, source_document_id) values ($1,$2,'document_extracted',false,$3) on conflict (user_id, lower(name)) do nothing returning id",
      [userId, name, documentId],
    );
    added += r.length;
  }
  for (const c of parsed.certifications) {
    const exists = await tx.one("select id from certifications where lower(name) = lower($1)", [c.name]);
    if (exists) continue;
    await tx.query("insert into certifications (user_id, name, issuer, source, verified, source_document_id) values ($1,$2,$3,'document_extracted',false,$4)", [userId, c.name.slice(0, 200), c.issuer, documentId]);
    added++;
  }
  for (const pr of parsed.projects) {
    const exists = await tx.one("select id from portfolio_projects where lower(name) = lower($1)", [pr.name]);
    if (exists) continue;
    // Status is unknown from a resume, so it is stored as in_progress until the user confirms it is completed
    await tx.query(
      "insert into portfolio_projects (user_id, name, description, url, tech, status, source, verified, source_document_id) values ($1,$2,$3,$4,$5::text[],'in_progress','document_extracted',false,$6)",
      [userId, pr.name.slice(0, 200), pr.description, pr.url, pr.tech, documentId],
    );
    added++;
  }
  // Fill empty profile fields only; never overwrite what the user typed
  await tx.query(
    `update career_profiles set
       summary = coalesce(summary, $1), location = coalesce(location, $2), phone = coalesce(phone, $3),
       linkedin_url = coalesce(linkedin_url, $4), github_url = coalesce(github_url, $5)`,
    [
      parsed.summary,
      parsed.location,
      parsed.phone,
      parsed.links.find((l) => /linkedin/i.test(l)) ? normalizeUrl(parsed.links.find((l) => /linkedin/i.test(l))!) : null,
      parsed.links.find((l) => /github/i.test(l)) ? normalizeUrl(parsed.links.find((l) => /github/i.test(l))!) : null,
    ],
  );
  if (parsed.fullName) await tx.query("update profiles set full_name = coalesce(full_name, $1)", [parsed.fullName]);
  return added;
}

function normalizeUrl(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export const FACT_TABLES = ["employment_history", "education", "verified_skills", "certifications", "portfolio_projects", "verified_achievements"] as const;
export type FactTable = (typeof FACT_TABLES)[number];

export async function setFactVerified(tx: Tx, table: FactTable, id: string, verified: boolean) {
  if (!FACT_TABLES.includes(table)) throw new Error("Unknown fact table");
  await tx.query(`update ${table} set verified = $2, source = case when $2 then 'user_verified' else source end where id = $1`, [id, verified]);
}

export async function deleteFact(tx: Tx, table: FactTable, id: string) {
  if (!FACT_TABLES.includes(table)) throw new Error("Unknown fact table");
  await tx.query(`delete from ${table} where id = $1`, [id]);
}
