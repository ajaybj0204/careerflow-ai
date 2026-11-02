import { untrusted } from "@careerflow/ai";
import { canonicalSkill, detectSkills, jdAnalysisSchema, tokenSimilarity, type JdAnalysis } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { getCareerContext, type CareerContext } from "./career-memory";
import { recordEvent } from "./automation";

const CITIES = ["Bengaluru", "Bangalore", "Mumbai", "Navi Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi", "New Delhi", "Gurugram", "Gurgaon", "Noida", "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Coimbatore", "Indore", "Chandigarh", "Remote"];

/** Rule-based job description analysis (works without AI). */
export function analyzeJdRules(jd: string, hint: { company?: string | null; roleTitle?: string | null } = {}): JdAnalysis {
  const text = jd.replace(/\r/g, "");
  const lower = text.toLowerCase();
  const exp = text.match(/(\d{1,2})\s*(?:\+\s*)?(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs)/i) ?? text.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  const lines = text.split("\n").map((l) => l.trim());
  const respStart = lines.findIndex((l) => /^(key )?(responsibilities|what you('| wi)ll do|role and responsibilities|job description|duties)/i.test(l));
  const reqStart = lines.findIndex((l) => /^(requirements|qualifications|what we('| a)re looking for|must have|skills( required)?|who you are|eligibility)/i.test(l));
  const grab = (start: number) => {
    if (start < 0) return [];
    const out: string[] = [];
    for (const l of lines.slice(start + 1)) {
      if (!l) {
        if (out.length) break;
        continue;
      }
      if (/^[A-Z][A-Za-z &']{2,40}:?$/.test(l) && out.length) break;
      out.push(l.replace(/^[•●▪◦‣\-–*\d.)]+\s*/, ""));
      if (out.length >= 15) break;
    }
    return out;
  };
  const skills = detectSkills(text);
  const reqText = reqStart >= 0 ? grab(reqStart).join("\n") : text;
  const required = detectSkills(reqText);
  const preferredBlock = text.match(/(?:preferred|nice to have|good to have|bonus)[\s\S]{0,800}/i)?.[0] ?? "";
  const preferred = detectSkills(preferredBlock).filter((s) => !required.includes(s));
  const title = hint.roleTitle ?? lines.find((l) => /^(job title|role|position)\s*[:-]/i.test(l))?.replace(/^[^:-]+[:-]\s*/, "") ?? null;
  const seniority = /\b(intern|internship)\b/i.test(title ?? lower.slice(0, 300))
    ? "intern"
    : /\b(head|director|vp|manager)\b/i.test(title ?? "")
      ? "manager"
      : /\b(lead|principal|staff)\b/i.test(title ?? "")
        ? "lead"
        : /\b(senior|sr\.?)\b/i.test(title ?? "")
          ? "senior"
          : /\b(fresher|entry level|graduate|0\s*-\s*1 years?)\b/i.test(lower)
            ? "entry"
            : exp
              ? Number(exp[1]) >= 5
                ? "senior"
                : Number(exp[1]) >= 2
                  ? "mid"
                  : "entry"
              : "unknown";
  return {
    company: hint.company ?? lines.find((l) => /^(company|organization|employer)\s*[:-]/i.test(l))?.replace(/^[^:-]+[:-]\s*/, "") ?? null,
    roleTitle: title,
    location: CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) ?? null,
    workMode: /\bremote\b/i.test(lower) ? (/\bhybrid\b/i.test(lower) ? "hybrid" : "remote") : /\bhybrid\b/i.test(lower) ? "hybrid" : /\b(on-?site|work from office|wfo)\b/i.test(lower) ? "onsite" : "unknown",
    seniority,
    industry: /\b(payment|fintech|upi|bank|lending|nbfc|card)\b/i.test(lower) ? "Financial services / FinTech" : /\b(e-?commerce|retail)\b/i.test(lower) ? "E-commerce" : /\bsaas\b/i.test(lower) ? "SaaS" : null,
    experienceMinYears: exp ? Number(exp[1]) : null,
    experienceMaxYears: exp && exp[2] ? Number(exp[2]) : null,
    salary: text.match(/(?:₹|inr|rs\.?)\s*[\d.,]+\s*(?:-|–|to)?\s*[\d.,]*\s*(?:lpa|lakhs?|l|per annum)?|[\d.]+\s*(?:-|–|to)\s*[\d.]+\s*lpa/i)?.[0] ?? null,
    responsibilities: grab(respStart),
    requiredSkills: required.length ? required : skills,
    preferredSkills: preferred,
    tools: skills.filter((s) => ["Excel", "SQL", "Power BI", "Tableau", "Looker", "Python", "Jira", "Salesforce", "Google Sheets", "SAP", "Zoho", "Freshdesk", "Metabase", "BigQuery", "Snowflake"].includes(s)),
    keywords: [...new Set([...skills, ...(text.match(/\b[A-Z]{2,6}\b/g) ?? []).filter((w) => !["AND", "THE", "FOR", "YOU", "OUR", "WITH", "WHO"].includes(w))])].slice(0, 40),
    education: text.match(/\b(b\.?e|b\.?tech|bachelor'?s?|mba|m\.?com|b\.?com|graduate|post-?graduate)[^.\n]{0,80}/i)?.[0] ?? null,
  };
}

export async function analyzeJd(db: Database, userId: string, jd: string, hint: { company?: string | null; roleTitle?: string | null } = {}): Promise<{ analysis: JdAnalysis; method: "rules" | "rules+ai" }> {
  const rules = analyzeJdRules(jd, hint);
  const ai = aiFor(db, userId);
  if (!ai) return { analysis: rules, method: "rules" };
  let data: JdAnalysis;
  try {
    data = (
      await ai.generateJson({
        feature: "jd.analyze",
        userId,
        schema: jdAnalysisSchema,
        system: "Extract structured information from a job description. Only extract what is written; use null or empty arrays when absent. Skills should be short names (e.g. 'SQL', 'Stakeholder Management').",
        prompt: untrusted("job_description", jd, 15000),
        temperature: 0,
      })
    ).data;
  } catch {
    // AI unavailable or returned invalid output: the rule-based analysis is still useful
    return { analysis: rules, method: "rules" };
  }
  const merge = (a: string[], b: string[]) => [...new Set([...a.map(canonicalSkill), ...b])];
  return {
    analysis: {
      ...data,
      company: hint.company ?? data.company,
      roleTitle: hint.roleTitle ?? data.roleTitle,
      requiredSkills: merge(data.requiredSkills, rules.requiredSkills),
      preferredSkills: merge(data.preferredSkills, []).filter((s) => !data.requiredSkills.includes(s)),
      keywords: merge(data.keywords, rules.keywords).slice(0, 40),
    },
    method: "rules+ai",
  };
}

export interface MatchReport {
  score: number;
  label: "Strong match" | "Good match" | "Partial match" | "Low match";
  disclaimer: string;
  matchedSkills: string[];
  missingSkills: string[];
  unconfirmedSkills: string[];
  preferredMatched: string[];
  experience: { required: string | null; yours: number | null; fit: "meets" | "below" | "above" | "unknown"; note: string };
  location: { fit: "yes" | "no" | "unknown"; note: string };
  role: { fit: "target" | "avoid" | "neutral"; note: string };
  reasons: string[];
  suggestions: string[];
}

/** Explainable comparison of a JD with the user's verified profile. */
export function buildMatchReport(a: JdAnalysis, ctx: CareerContext, unverifiedSkillNames: string[] = []): MatchReport {
  const verified = new Set(ctx.skills.map((s) => canonicalSkill(s.name).toLowerCase()));
  for (const p of ctx.projects) for (const t of p.tech) verified.add(canonicalSkill(t).toLowerCase());
  const unverified = new Set(unverifiedSkillNames.map((s) => canonicalSkill(s).toLowerCase()));
  const req = [...new Set(a.requiredSkills.map(canonicalSkill))];
  const matched = req.filter((s) => verified.has(s.toLowerCase()));
  const unconfirmed = req.filter((s) => !verified.has(s.toLowerCase()) && unverified.has(s.toLowerCase()));
  const missing = req.filter((s) => !verified.has(s.toLowerCase()) && !unverified.has(s.toLowerCase()));
  const prefMatched = a.preferredSkills.map(canonicalSkill).filter((s) => verified.has(s.toLowerCase()));

  const yrs = ctx.profile.yearsExperience;
  let expFit: MatchReport["experience"]["fit"] = "unknown";
  let expNote = "Add your total years of experience to your profile to compare.";
  if (yrs !== null && a.experienceMinYears !== null) {
    if (yrs < a.experienceMinYears) {
      expFit = "below";
      expNote = `The role asks for ${a.experienceMinYears}+ years; your profile shows ${yrs}.`;
    } else if (a.experienceMaxYears !== null && yrs > a.experienceMaxYears + 2) {
      expFit = "above";
      expNote = `The role targets up to ${a.experienceMaxYears} years; you have ${yrs}. It may be junior for you.`;
    } else {
      expFit = "meets";
      expNote = `Your ${yrs} years fit the ${a.experienceMinYears}${a.experienceMaxYears !== null ? `–${a.experienceMaxYears}` : "+"} years asked.`;
    }
  } else if (a.experienceMinYears === null) expNote = "The job description does not state an experience requirement.";

  const prefs = ctx.profile.preferredLocations.map((l) => l.toLowerCase().replace("bangalore", "bengaluru"));
  const jdLoc = (a.location ?? "").toLowerCase().replace("bangalore", "bengaluru");
  let locFit: MatchReport["location"]["fit"] = "unknown";
  let locNote = "Location not stated in the job description.";
  if (a.workMode === "remote") {
    locFit = "yes";
    locNote = "Remote role.";
  } else if (jdLoc && prefs.length) {
    locFit = prefs.some((p) => jdLoc.includes(p) || p.includes(jdLoc)) ? "yes" : "no";
    locNote = locFit === "yes" ? `${a.location} is one of your preferred locations.` : `${a.location} is not in your preferred locations.`;
  }

  const title = a.roleTitle ?? "";
  const isAvoid = ctx.profile.avoidRoles.some((r) => tokenSimilarity(r, title) >= 0.5 || title.toLowerCase().includes(r.toLowerCase()));
  const isTarget = ctx.profile.targetRoles.some((r) => tokenSimilarity(r, title) >= 0.5);
  const roleFit: MatchReport["role"]["fit"] = isAvoid ? "avoid" : isTarget ? "target" : "neutral";

  const skillScore = req.length ? matched.length / req.length : 0.5;
  const expScore = expFit === "meets" ? 1 : expFit === "unknown" ? 0.6 : expFit === "above" ? 0.7 : Math.max(0, 1 - ((a.experienceMinYears ?? 0) - (yrs ?? 0)) * 0.3);
  const locScore = locFit === "yes" ? 1 : locFit === "unknown" ? 0.7 : 0.3;
  const roleScore = roleFit === "target" ? 1 : roleFit === "neutral" ? 0.6 : 0;
  const score = Math.round((skillScore * 0.6 + expScore * 0.2 + locScore * 0.1 + roleScore * 0.1) * 100);

  const reasons = [
    `${matched.length} of ${req.length} required skills are in your verified profile${matched.length ? `: ${matched.join(", ")}` : ""}.`,
    expNote,
    locNote,
    roleFit === "target" ? "This role is one of your target roles." : roleFit === "avoid" ? "This looks like a role type you said you want to avoid." : "This role is not in your target roles list.",
  ];
  const suggestions: string[] = [];
  if (unconfirmed.length) suggestions.push(`Confirm these skills in your profile if you have them: ${unconfirmed.join(", ")}.`);
  if (missing.length) suggestions.push(`Not in your profile: ${missing.join(", ")}. Only mention them if you genuinely have them; otherwise consider learning them.`);
  if (expFit === "below") suggestions.push("Highlight projects and responsibilities that show depth beyond your years.");
  return {
    score,
    label: score >= 80 ? "Strong match" : score >= 65 ? "Good match" : score >= 45 ? "Partial match" : "Low match",
    disclaimer: "This compares the job description with your verified profile. It is not a prediction of whether you will be hired.",
    matchedSkills: matched,
    missingSkills: missing,
    unconfirmedSkills: unconfirmed,
    preferredMatched: prefMatched,
    experience: { required: a.experienceMinYears !== null ? `${a.experienceMinYears}${a.experienceMaxYears !== null ? `–${a.experienceMaxYears}` : "+"} years` : null, yours: yrs, fit: expFit, note: expNote },
    location: { fit: locFit, note: locNote },
    role: { fit: roleFit, note: reasons[3] },
    reasons,
    suggestions,
  };
}

/** Analyses the JD of an application, stores a match report, and returns it. */
export async function createMatchReport(db: Database, userId: string, applicationId: string | null, jd: string, hint: { company?: string | null; roleTitle?: string | null } = {}) {
  const { analysis, method } = await analyzeJd(db, userId, jd, hint);
  return db.withUser(userId, async (tx) => {
    const ctx = await getCareerContext(tx);
    const unverified = (await tx.query<{ name: string }>("select name from verified_skills where not verified")).map((r) => r.name);
    const report = buildMatchReport(analysis, ctx, unverified);
    const row = await tx.one<{ id: string }>(
      "insert into job_match_reports (user_id, application_id, analysis, match, score, method) values ($1,$2,$3::jsonb,$4::jsonb,$5,$6) returning id",
      [userId, applicationId, JSON.stringify(analysis), JSON.stringify(report), report.score, method],
    );
    if (applicationId) {
      await tx.query(
        "update applications set job_description = coalesce(job_description, $2), location = coalesce(location, $3), work_mode = coalesce(work_mode, $4), salary_text = coalesce(salary_text, $5) where id = $1",
        [applicationId, jd, analysis.location, analysis.workMode, analysis.salary],
      );
    }
    return { id: row!.id, analysis, report, method };
  });
}

export async function latestMatchReport(tx: Tx, applicationId: string) {
  return tx.one("select * from job_match_reports where application_id = $1 order by created_at desc limit 1", [applicationId]);
}

export { recordEvent };
