import { z } from "zod";
import { APPLICATION_STATUSES } from "./status";

const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://");

// ---------------------------------------------------------------------------
// Form inputs
// ---------------------------------------------------------------------------
export const applicationInput = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  roleTitle: z.string().trim().min(1, "Role is required").max(200),
  location: optText(200),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]).optional().nullable(),
  jobUrl: optUrl,
  jobPortal: optText(100),
  externalJobId: optText(100),
  jobDescription: optText(30000),
  status: z.enum(APPLICATION_STATUSES).default("saved"),
  appliedAt: optText(40),
  salaryText: optText(200),
  notes: optText(5000),
  nextAction: optText(300),
  nextActionDue: optText(40),
});
export type ApplicationInput = z.infer<typeof applicationInput>;

export const careerProfileInput = z.object({
  fullName: optText(120),
  headline: optText(200),
  summary: optText(3000),
  location: optText(120),
  phone: optText(40),
  yearsExperience: z.coerce.number().min(0).max(60).optional().nullable(),
  currentCtcLpa: z.coerce.number().min(0).max(1000).optional().nullable(),
  expectedCtcMinLpa: z.coerce.number().min(0).max(1000).optional().nullable(),
  expectedCtcMaxLpa: z.coerce.number().min(0).max(1000).optional().nullable(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  targetRoles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  avoidRoles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  preferredLocations: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]),
  careerGoals: optText(3000),
  linkedinUrl: optUrl,
  githubUrl: optUrl,
  portfolioUrl: optUrl,
  userType: z.enum(["fresher", "experienced", "switcher"]).optional(),
});
export type CareerProfileInput = z.infer<typeof careerProfileInput>;

// ---------------------------------------------------------------------------
// AI output schemas (validated before anything is saved or shown)
// ---------------------------------------------------------------------------
export const jdAnalysisSchema = z.object({
  company: z.string().nullable(),
  roleTitle: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]).nullable(),
  seniority: z.enum(["intern", "entry", "mid", "senior", "lead", "manager", "unknown"]).nullable(),
  industry: z.string().nullable(),
  experienceMinYears: z.number().nullable(),
  experienceMaxYears: z.number().nullable(),
  salary: z.string().nullable(),
  responsibilities: z.array(z.string()).max(30),
  requiredSkills: z.array(z.string()).max(40),
  preferredSkills: z.array(z.string()).max(40),
  tools: z.array(z.string()).max(30),
  keywords: z.array(z.string()).max(40),
  education: z.string().nullable(),
});
export type JdAnalysis = z.infer<typeof jdAnalysisSchema>;

export const resumeEditSchema = z.object({
  edits: z
    .array(
      z.object({
        paragraphIndex: z.number().int().min(0),
        proposed: z.string().min(1).max(1200),
        reason: z.string().max(400),
      }),
    )
    .max(40),
  skillsOrder: z.array(z.string()).max(60).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type ResumeEditSuggestions = z.infer<typeof resumeEditSchema>;

export const parsedResumeSchema = z.object({
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  links: z.array(z.string()).max(10),
  employment: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        location: z.string().nullable(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        isCurrent: z.boolean(),
        bullets: z.array(z.string()).max(20),
      }),
    )
    .max(20),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().nullable(),
        field: z.string().nullable(),
        endYear: z.number().nullable(),
        grade: z.string().nullable(),
      }),
    )
    .max(10),
  skills: z.array(z.string()).max(80),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string().nullable() })).max(30),
  projects: z
    .array(z.object({ name: z.string(), description: z.string().nullable(), tech: z.array(z.string()).max(20), url: z.string().nullable() }))
    .max(20),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const EMAIL_CATEGORIES = [
  "application_confirmation",
  "recruiter_acknowledgement",
  "recruiter_outreach",
  "assessment_invitation",
  "interview_invitation",
  "interview_rescheduled",
  "rejection",
  "offer",
  "withdrawal_or_closure",
  "not_job_related",
] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const emailClassificationSchema = z.object({
  category: z.enum(EMAIL_CATEGORIES),
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  jobTitle: z.string().nullable(),
  jobId: z.string().nullable(),
  applicationId: z.string().nullable(),
  source: z.string().nullable(),
  recruiterName: z.string().nullable(),
  recruiterEmail: z.string().nullable(),
  assessmentLink: z.string().nullable(),
  assessmentDeadline: z.string().nullable(),
  interviewDateTime: z.string().nullable(),
  interviewMode: z.string().nullable(),
  interviewLink: z.string().nullable(),
  offerDetails: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  links: z.array(z.string()).max(10),
});
export type EmailClassification = z.infer<typeof emailClassificationSchema>;

export const copilotAnswerSchema = z.object({
  answer: z.string().min(1).max(6000),
  usedFacts: z.array(z.string()).max(20),
  missingFacts: z.array(z.string()).max(10),
});

export const extractedQuestionsSchema = z.object({
  questions: z.array(z.object({ question: z.string(), charLimit: z.number().nullable() })).max(30),
});

export const coverLetterSchema = z.object({
  greeting: z.string().max(200),
  paragraphs: z.array(z.string().max(2500)).min(2).max(6),
  closing: z.string().max(200),
  usedFacts: z.array(z.string()).max(20),
});
export type CoverLetter = z.infer<typeof coverLetterSchema>;

export const answerFeedbackSchema = z.object({
  strengths: z.array(z.string()).max(8),
  gaps: z.array(z.string()).max(8),
  structureNotes: z.string().max(1200),
  improvedApproach: z.array(z.string()).max(10),
  topicsToPractice: z.array(z.string()).max(8),
});
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>;

export const mockTurnSchema = z.object({
  nextQuestion: z.string().max(800).nullable(),
  isFollowUp: z.boolean(),
  done: z.boolean(),
});

export const mockFeedbackSchema = z.object({
  summary: z.string().max(2000),
  perAnswer: z
    .array(z.object({ question: z.string(), observation: z.string(), suggestion: z.string() }))
    .max(20),
  strengths: z.array(z.string()).max(8),
  improvements: z.array(z.string()).max(8),
  topicsToPractice: z.array(z.string()).max(8),
});

export const offerExtractionSchema = z.object({
  company: z.string().nullable(),
  roleTitle: z.string().nullable(),
  fixedCtc: z.number().nullable(),
  variablePay: z.number().nullable(),
  joiningBonus: z.number().nullable(),
  otherBonus: z.number().nullable(),
  benefits: z.array(z.string()).max(30),
  joiningDate: z.string().nullable(),
  probationMonths: z.number().nullable(),
  noticePeriodDays: z.number().nullable(),
  location: z.string().nullable(),
  clauses: z.array(z.object({ title: z.string(), text: z.string(), note: z.string().nullable() })).max(30),
  components: z.array(z.object({ name: z.string(), annualAmount: z.number().nullable(), kind: z.enum(["fixed", "variable", "bonus", "benefit", "deduction", "other"]) })).max(40),
});

export const postInterviewAnalysisSchema = z.object({
  summary: z.string().max(1500),
  weakTopics: z.array(z.object({ topic: z.string(), evidence: z.string() })).max(10),
  strengths: z.array(z.string()).max(8),
  practiceQuestions: z.array(z.string()).max(12),
  revisionPlan: z.array(z.string()).max(12),
});

export const learningPlanSchema = z.object({
  title: z.string(),
  modules: z
    .array(
      z.object({
        day: z.number().int().min(1),
        title: z.string(),
        description: z.string(),
        kind: z.enum(["lesson", "practice", "project", "review", "assessment"]),
        skill: z.string().nullable(),
      }),
    )
    .max(120),
});

export const outreachDraftSchema = z.object({
  subject: z.string().max(200).nullable(),
  body: z.string().max(5000),
});

export const companyResearchSchema = z.object({
  overview: z.string().max(2000),
  industry: z.string().nullable(),
  products: z.string().nullable(),
  interviewTopics: z.array(z.string()).max(12),
  recentNews: z.array(z.object({ title: z.string(), date: z.string().nullable(), url: z.string().nullable() })).max(8),
});

export const profileSuggestionSchema = z.object({
  headline: z.string().max(220),
  about: z.string().max(2600),
  experienceRewrites: z.array(z.object({ company: z.string(), text: z.string() })).max(10),
  skillsToFeature: z.array(z.string()).max(20),
  projectBlurbs: z.array(z.object({ project: z.string(), text: z.string() })).max(10),
});

export const strategyNarrativeSchema = z.object({
  summary: z.string().max(1500),
  focus: z.array(z.string()).max(6),
});

export const prepPlanSchema = z.object({
  blocks: z
    .array(z.object({ minutes: z.number().int().min(5).max(120), title: z.string(), activities: z.array(z.string()).max(8) }))
    .max(12),
  likelyQuestions: z.array(z.string()).max(20),
  keyPointsFromResume: z.array(z.string()).max(12),
});
