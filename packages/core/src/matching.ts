import { emailDomain, normalizeCompany, rootDomain, tokenSimilarity, type EmailClassification } from "@careerflow/shared";

export interface MatchCandidateApp {
  id: string;
  company: string;
  company_domain: string | null;
  role_title: string;
  external_job_id: string | null;
  external_application_id: string | null;
  gmail_thread_ids: string[];
  recruiter_email: string | null;
  created_at: string;
  status: string;
}

export interface MatchResult {
  applicationId: string;
  score: number;
  reasons: string[];
}

export const MATCH_HIGH = 0.8;
export const MATCH_MEDIUM = 0.5;

/** Scores how likely an email belongs to each application. Pure function, easy to test and explain. */
export function scoreMatches(
  apps: MatchCandidateApp[],
  c: Pick<EmailClassification, "company" | "jobTitle" | "jobId" | "applicationId" | "recruiterEmail">,
  msg: { threadId: string; fromEmail: string | null; date: Date },
): MatchResult[] {
  const company = normalizeCompany(c.company);
  const domain = rootDomain(emailDomain(msg.fromEmail));
  const results: MatchResult[] = [];
  for (const a of apps) {
    let s = 0;
    const why: string[] = [];
    if (a.gmail_thread_ids?.includes(msg.threadId)) {
      s += 0.6;
      why.push("Same Gmail thread as an earlier email for this application");
    }
    if (c.jobId && a.external_job_id && c.jobId.toLowerCase() === a.external_job_id.toLowerCase()) {
      s += 0.5;
      why.push(`Job ID ${c.jobId} matches`);
    }
    if (c.applicationId && a.external_application_id && c.applicationId.toLowerCase() === a.external_application_id.toLowerCase()) {
      s += 0.5;
      why.push(`Application ID ${c.applicationId} matches`);
    }
    const ac = normalizeCompany(a.company);
    if (company && ac) {
      if (company === ac) {
        s += 0.4;
        why.push(`Company "${a.company}" matches`);
      } else if (company.includes(ac) || ac.includes(company)) {
        s += 0.25;
        why.push(`Company name is similar to "${a.company}"`);
      }
    }
    if (domain && (a.company_domain ? rootDomain(a.company_domain) === domain : ac.length >= 4 && domain.split(".")[0].includes(ac.replace(/\s+/g, "")))) {
      s += 0.2;
      why.push(`Sender domain ${domain} belongs to the company`);
    }
    if (c.jobTitle) {
      const sim = tokenSimilarity(c.jobTitle, a.role_title);
      if (sim >= 0.75) {
        s += 0.25;
        why.push(`Job title "${c.jobTitle}" matches`);
      } else if (sim >= 0.4) {
        s += 0.1;
        why.push(`Job title is similar`);
      } else if (sim === 0 && company === ac) {
        s -= 0.15; // same company, clearly different role
        why.push("Different job title at the same company");
      }
    }
    if (c.recruiterEmail && a.recruiter_email && c.recruiterEmail.toLowerCase() === a.recruiter_email.toLowerCase()) {
      s += 0.2;
      why.push("Same recruiter as before");
    }
    if (new Date(a.created_at).getTime() > msg.date.getTime() + 24 * 3600 * 1000 && !a.gmail_thread_ids?.includes(msg.threadId)) {
      s -= 0.2;
      why.push("Email is older than the application record");
    }
    if (s > 0) results.push({ applicationId: a.id, score: Math.max(0, Math.min(1, s)), reasons: why });
  }
  return results.sort((x, y) => y.score - x.score);
}

export type MatchDecision =
  | { kind: "high"; best: MatchResult }
  | { kind: "medium"; candidates: MatchResult[] }
  | { kind: "low"; candidates: MatchResult[] };

/** High = update automatically; medium = ask the user to verify; low = Needs Review / new application. */
export function decideMatch(results: MatchResult[]): MatchDecision {
  const [a, b] = results;
  if (!a || a.score < MATCH_MEDIUM) return { kind: "low", candidates: results.slice(0, 3) };
  // Two applications at the same company with similar scores is ambiguous
  if (a.score >= MATCH_HIGH && (!b || a.score - b.score >= 0.15)) return { kind: "high", best: a };
  return { kind: "medium", candidates: results.slice(0, 3) };
}
