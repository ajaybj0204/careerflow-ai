import type { EmailCategory, EmailClassification } from "@careerflow/shared";
import { emailDomain, rootDomain } from "@careerflow/shared";
import type { GmailMessage } from "./client";

/**
 * Rule-based email classification. Deterministic, explainable and free to run, so it works without AI.
 * When AI is configured it may refine low-confidence results (see core/automation), but these rules
 * remain the baseline and guard rails (e.g. job-alert newsletters are never treated as applications).
 */

interface Rule {
  category: EmailCategory;
  strong: RegExp[];
  weak?: RegExp[];
}

const RULES: Rule[] = [
  {
    category: "offer",
    strong: [
      /\boffer letter\b/i,
      /\b(pleased|happy|delighted|excited) to (extend|offer|make you an offer)/i,
      /\boffer of employment\b/i,
      /\bletter of (offer|intent)\b/i,
      /\byour offer (from|at|with)\b/i,
    ],
    weak: [/\bcompensation (details|package)\b/i, /\bjoining date\b/i],
  },
  {
    category: "rejection",
    strong: [
      /\b(decided|chosen|decision) (not )?to (move|proceed|go) forward with (other|another|different) candidates?\b/i,
      /\bnot (be )?(moving|proceeding|progressing) (forward )?with your (application|candidature|profile)\b/i,
      /\bwill not be (moving|proceeding|progressing)\b/i,
      /\bregret to inform\b/i,
      /\byou (have|were) not been selected\b/i,
      /\bunable to (offer you|move forward)\b/i,
      /\bnot (been )?shortlisted\b/i,
      /\bposition has been filled\b/i,
      /\bwe have decided to pursue other candidates\b/i,
    ],
    weak: [/\bunfortunately\b/i, /\bkeep your (resume|cv|profile) on file\b/i],
  },
  {
    category: "withdrawal_or_closure",
    strong: [/\b(job|position|role|requisition|posting) (has been|is now) (closed|cancelled|canceled|withdrawn|put on hold)\b/i, /\byou have withdrawn your application\b/i],
  },
  {
    category: "interview_rescheduled",
    strong: [/\b(interview|meeting|call)\b[^.]{0,60}\b(rescheduled|re-scheduled|moved to|postponed)\b/i, /\b(rescheduled|new time for) (your|the) interview\b/i, /\bupdated invitation\b/i],
  },
  {
    category: "interview_invitation",
    strong: [
      /\b(invite|invitation|invited) (you )?(for|to) (an? )?(interview|discussion|conversation|call)\b/i,
      /\binterview (schedule|scheduled|slot|invitation|confirmation)\b/i,
      /\b(schedule|book) (an? |your )?(interview|call|time)\b/i,
      /\bshare your availability\b/i,
      /\b(technical|hr|managerial|first|second|final) round\b/i,
      /^invitation:/i,
    ],
    weak: [/\binterview\b/i, /\bshortlisted\b/i],
  },
  {
    category: "assessment_invitation",
    strong: [
      /\b(online |coding |technical |aptitude )?(assessment|test|challenge) (invitation|link|invite)\b/i,
      /\b(complete|take) (the|an|your) (online )?(assessment|test|challenge|case study)\b/i,
      /\b(hackerrank|hackerearth|codility|mettl|testgorilla|imocha|codesignal|amcat|shl|talview)\b/i,
    ],
    weak: [/\bassessment\b/i, /\bcase study\b/i],
  },
  {
    category: "application_confirmation",
    strong: [
      /\bthank(s| you) for (applying|your application|submitting your application)\b/i,
      /\b(we('ve| have)|has been) received your application\b/i,
      /\bapplication (has been )?(received|submitted|successfully submitted)\b/i,
      /\byour application (to|for|at) .{2,80} (has been|was) (received|submitted)\b/i,
      /\bapplied successfully\b|\bsuccessfully applied\b/i,
      /\bapplication sent to\b/i,
    ],
    weak: [/\bthank you for your interest\b/i, /\byour application\b/i],
  },
  {
    category: "recruiter_acknowledgement",
    strong: [/\b(currently )?(reviewing|under review|being reviewed)\b.{0,40}\b(application|profile|resume)\b/i, /\byou('ve| have) been shortlisted\b/i, /\bshortlisted for\b/i],
  },
  {
    category: "recruiter_outreach",
    strong: [/\bcame across your (profile|resume)\b/i, /\b(are you|would you be) (open|interested) (to|in)\b.{0,40}\b(role|opportunity|position)\b/i, /\brecruiter (viewed|has viewed) your profile\b/i],
  },
];

const NOT_JOB = [
  /\bjob alert\b/i,
  /\bjobs? (for you|you may be interested in|matching your)\b/i,
  /\brecommended jobs\b/i,
  /\bnew jobs? (posted|matching)\b/i,
  /\bnewsletter\b/i,
  /\bwebinar\b/i,
  /\bsale\b.*\boff\b/i,
  /\byour (order|otp|statement|bill)\b/i,
];

const ATS: [RegExp, string][] = [
  [/greenhouse\.io/i, "Greenhouse"],
  [/lever\.co/i, "Lever"],
  [/myworkday|workday\.com/i, "Workday"],
  [/smartrecruiters/i, "SmartRecruiters"],
  [/icims/i, "iCIMS"],
  [/ashbyhq/i, "Ashby"],
  [/successfactors/i, "SuccessFactors"],
  [/zohorecruit/i, "Zoho Recruit"],
  [/darwinbox/i, "Darwinbox"],
  [/keka/i, "Keka"],
  [/naukri/i, "Naukri"],
  [/linkedin/i, "LinkedIn"],
  [/indeed/i, "Indeed"],
  [/foundit|monsterindia/i, "Foundit"],
  [/instahyre/i, "Instahyre"],
  [/cutshort/i, "Cutshort"],
  [/wellfound|angel\.co/i, "Wellfound"],
  [/iimjobs/i, "iimjobs"],
  [/hirist/i, "Hirist"],
  [/internshala/i, "Internshala"],
  [/shine\.com/i, "Shine"],
  [/timesjobs/i, "TimesJobs"],
];

const GENERIC_SENDER = /^(no-?reply|noreply|do-?not-?reply|careers?|jobs?|talent|recruit(ing|ment|er)?|hr|hiring|notifications?|team|info|support|alerts?)$/i;
const PERSONAL_MAIL = /^(gmail|yahoo|outlook|hotmail|live|icloud|rediffmail|protonmail)\.com$/i;

function cleanCompany(s: string | null | undefined): string | null {
  if (!s) return null;
  const c = s
    .replace(/\b(careers?|jobs?|talent( acquisition)?|recruiting|recruitment|hiring( team)?|hr( team)?|team|via \w+|notifications?|no-?reply)\b/gi, "")
    .replace(/[|•:–-]+\s*$/g, "")
    .replace(/^\s*[|•:–-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return c.length >= 2 && c.length <= 80 ? c : null;
}

function extractCompany(m: GmailMessage, source: string | null, title: string | null): string | null {
  const subj = m.subject;
  const head = m.text.slice(0, 3000);
  const subjectAt =
    subj.match(/\b(?:applying|application|applied|interest)\s+(?:to|at|with)\s+([A-Z][\w&.' -]{1,60}?)(?:\s*[!.|,-]|\s+for\b|$)/)?.[1] ??
    subj.match(/\bat\s+([A-Z][\w&.' -]{1,50}?)(?:\s*[!.|,-]|$)/)?.[1];
  const subjectTail = subj.match(/[-–|]\s*([A-Z][\w&.' ]{1,50})\s*$/)?.[1];
  const bodyThanks = head.match(/\b(?:thank you for (?:applying|your interest) (?:to|in|at|with))\s+([A-Z][\w&.' -]{1,60}?)(?:[.!,]|\s+for\b|\s+and\b)/)?.[1];
  const bodyRoleAt = head.match(/\b(?:role|position|opening|job)\s+(?:at|with)\s+([A-Z][\w&.' -]{1,50}?)(?:[.,!:;]|\s+(?:is|has|we|and|please)\b|$)/m)?.[1];
  const bodyTeam = head.match(/\b(?:the )?([A-Z][\w&.' ]{1,40}) (?:talent acquisition|recruiting|hiring) team\b/)?.[1];
  const display = cleanCompany(m.fromName);
  const domain = rootDomain(emailDomain(m.fromEmail));
  const domainName = domain && !PERSONAL_MAIL.test(domain) && !ATS.some(([re]) => re.test(domain)) ? domain.split(".")[0] : null;
  const viaPortal = !!source && ATS.some(([, n]) => n === source);
  // Job portals send on behalf of employers: prefer the subject/body over the sender name
  const ordered = viaPortal
    ? [subjectAt, bodyThanks, bodyRoleAt, bodyTeam, subjectTail, display]
    : [subjectAt, bodyThanks, bodyRoleAt, display, bodyTeam, subjectTail];
  const titleNorm = title?.toLowerCase().trim();
  const valid = ordered
    .map((c) => cleanCompany(c))
    .filter((c): c is string => !!c)
    .filter((c) => !(source && c.toLowerCase() === source.toLowerCase()) && !GENERIC_SENDER.test(c) && c.toLowerCase() !== titleNorm)
    .filter((c) => !/\b(analyst|associate|manager|executive|engineer|developer|specialist|intern|lead|consultant|officer|operations analyst)\b/i.test(c) || (domainName && c.toLowerCase().replace(/\s+/g, "").includes(domainName)));
  // Prefer a candidate that agrees with the sender's company domain
  if (domainName) {
    const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const agreeing = valid.find((c) => domainName.includes(squash(c).slice(0, Math.max(4, Math.min(8, squash(c).length)))) || squash(c).includes(domainName));
    if (agreeing) return agreeing;
  }
  if (valid[0]) return valid[0];
  return domainName ? domainName.charAt(0).toUpperCase() + domainName.slice(1) : null;
}

function extractTitle(m: GmailMessage): string | null {
  const s = `${m.subject}\n${m.text.slice(0, 2000)}`;
  const re = [
    /\b(?:application|applying|applied|candidature|interest)\s+(?:for|to)\s+(?:the\s+)?(?:position\s+of\s+|role\s+of\s+)?["“]?([A-Z][\w/&,() .+-]{2,80}?)["”]?\s+(?:position|role|opening|at|with|-|–|\||$)/m,
    /\b(?:position|role|job title)\s*[:-]\s*([^\n|]{3,80})/i,
    /\bfor the ([A-Z][\w/& .+-]{2,60}) (?:role|position)\b/,
  ];
  for (const r of re) {
    const v = s.match(r)?.[1]?.trim().replace(/[.,]$/, "");
    if (v && v.length >= 3 && !/\b(your|our|this|the company)\b/i.test(v)) return v;
  }
  // "Offer letter – Product Operations Analyst", "Interview | Data Analyst"
  const tail = m.subject.match(/[-–|:]\s*([A-Z][\w/& .+-]{2,60})\s*$/)?.[1]?.trim();
  if (tail && /\b(analyst|associate|manager|executive|engineer|developer|specialist|intern|lead|consultant|officer|operations|designer|scientist)\b/i.test(tail)) return tail;
  return null;
}

function extractLinks(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((u) => u.replace(/[.,;]+$/, "")))].filter((u) => !/unsubscribe|optout|preferences|privacy|facebook|twitter|instagram|youtube/i.test(u)).slice(0, 10);
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
function extractDateTime(text: string): string | null {
  const re = new RegExp(
    `((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})[a-z]*,?\\s+\\d{4}|(?:${MONTHS})[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})(?:[^\\n\\d]{0,12}(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2}))?(?:\\s*(ist|gmt|utc)[^\\s]*)?`,
    "i",
  );
  return text.match(re)?.[0]?.trim() ?? null;
}

export interface RuleClassification extends EmailClassification {
  matched: string[];
}

export function classifyEmail(m: GmailMessage): RuleClassification {
  const subject = m.subject ?? "";
  const body = (m.text || m.snippet || "").slice(0, 8000);
  const hay = `${subject}\n${body}`;
  const sourceDomain = `${emailDomain(m.fromEmail) ?? ""} ${hay.slice(0, 3000)}`;
  const source = ATS.find(([re]) => re.test(emailDomain(m.fromEmail) ?? ""))?.[1] ?? ATS.find(([re]) => re.test(sourceDomain))?.[1] ?? null;

  const base = (category: EmailCategory, confidence: number, matched: string[]): RuleClassification => {
    const links = extractLinks(body);
    const jobTitle = category === "not_job_related" ? null : extractTitle(m);
    const company = category === "not_job_related" ? null : extractCompany(m, source, jobTitle);
    return {
      category,
      confidence,
      matched,
      company,
      jobTitle,
      jobId: hay.match(/\b(?:job|req(?:uisition)?|position)\s*(?:id|no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,30})\b/i)?.[1] ?? null,
      applicationId: hay.match(/\bapplication\s*(?:id|no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,30})\b/i)?.[1] ?? null,
      source,
      recruiterName: m.fromName && !GENERIC_SENDER.test(m.fromName.split(" ")[0]) && /^[A-Z][a-z]+(\s[A-Z][a-z]+){0,2}$/.test(m.fromName.trim()) ? m.fromName.trim() : null,
      recruiterEmail: m.fromEmail && !/no-?reply|donotreply/i.test(m.fromEmail) ? m.fromEmail : null,
      assessmentLink: category === "assessment_invitation" ? links.find((l) => /hackerrank|hackerearth|codility|mettl|testgorilla|imocha|codesignal|assess|test/i.test(l)) ?? null : null,
      assessmentDeadline: category === "assessment_invitation" ? (body.match(/\b(?:by|before|deadline|due|within)\b[^.\n]{0,80}/i)?.[0] ?? null) : null,
      interviewDateTime: category === "interview_invitation" || category === "interview_rescheduled" ? extractDateTime(hay) : null,
      interviewMode: /zoom\.us|meet\.google|teams\.microsoft|webex/i.test(body) ? "video" : /\b(phone|telephonic) (call|interview)\b/i.test(body) ? "phone" : /\b(office|in[- ]person|onsite|on-site|venue)\b/i.test(body) ? "onsite" : null,
      interviewLink: links.find((l) => /zoom\.us|meet\.google|teams\.microsoft|webex/i.test(l)) ?? null,
      offerDetails: category === "offer" ? body.match(/[^.\n]*(ctc|compensation|salary|package)[^.\n]*/i)?.[0]?.trim().slice(0, 300) ?? null : null,
      rejectionReason: null,
      links,
    };
  };

  // Newsletters and job alerts are never applications
  const notJob = NOT_JOB.filter((r) => r.test(subject) || r.test(body.slice(0, 600)));
  if (notJob.length && !/thank(s| you) for applying|interview|offer letter/i.test(subject)) {
    return base("not_job_related", 0.9, notJob.map(String));
  }

  let best: { category: EmailCategory; score: number; matched: string[] } | null = null;
  for (const rule of RULES) {
    const strong = rule.strong.filter((r) => r.test(hay));
    const strongSubject = rule.strong.filter((r) => r.test(subject));
    const weak = (rule.weak ?? []).filter((r) => r.test(hay));
    let score = 0;
    if (strong.length) score = 0.82 + Math.min(0.12, 0.04 * (strong.length - 1)) + (strongSubject.length ? 0.04 : 0);
    else if (weak.length) score = 0.45 + Math.min(0.15, 0.05 * (weak.length - 1));
    if (score > (best?.score ?? 0)) best = { category: rule.category, score, matched: [...strong, ...weak].map(String) };
  }
  if (!best) return base("not_job_related", 0.6, []);

  // A rejection that merely mentions "interview" (e.g. "after your interview, unfortunately…") stays a rejection.
  return base(best.category, Math.min(0.98, best.score), best.matched);
}
