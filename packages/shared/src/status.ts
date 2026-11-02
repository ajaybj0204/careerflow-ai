export const APPLICATION_STATUSES = [
  "saved",
  "preparing",
  "applied",
  "acknowledged",
  "under_review",
  "recruiter_contacted",
  "shortlisted",
  "assessment_pending",
  "assessment_completed",
  "interview_scheduling",
  "interview_scheduled",
  "interview_completed",
  "next_round",
  "hr_round",
  "offer_received",
  "offer_accepted",
  "selected",
  "rejected",
  "withdrawn",
  "on_hold",
  "no_response",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  preparing: "Preparing to Apply",
  applied: "Applied",
  acknowledged: "Acknowledged",
  under_review: "Under Review",
  recruiter_contacted: "Recruiter Contacted",
  shortlisted: "Shortlisted",
  assessment_pending: "Assessment Pending",
  assessment_completed: "Assessment Completed",
  interview_scheduling: "Interview Scheduling Required",
  interview_scheduled: "Interview Scheduled",
  interview_completed: "Interview Completed",
  next_round: "Next Round",
  hr_round: "HR Round",
  offer_received: "Offer Received",
  offer_accepted: "Offer Accepted",
  selected: "Selected",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  on_hold: "On Hold",
  no_response: "No Response",
};

/**
 * Pipeline rank. Automation only moves an application forward (higher rank) unless the event is terminal
 * (rejection/offer/withdrawal) and confidence is high. Side states (on_hold, no_response) share rank with "applied".
 */
export const STATUS_RANK: Record<ApplicationStatus, number> = {
  saved: 0,
  preparing: 1,
  applied: 2,
  no_response: 2,
  on_hold: 2,
  acknowledged: 3,
  under_review: 4,
  recruiter_contacted: 5,
  shortlisted: 6,
  assessment_pending: 7,
  assessment_completed: 8,
  interview_scheduling: 9,
  interview_scheduled: 10,
  interview_completed: 11,
  next_round: 12,
  hr_round: 13,
  offer_received: 14,
  offer_accepted: 15,
  selected: 15,
  rejected: 20,
  withdrawn: 20,
};

export const TERMINAL_STATUSES: ApplicationStatus[] = ["rejected", "withdrawn", "offer_accepted", "selected"];

/** Statuses that count as "submitted" for analytics denominators. */
export const SUBMITTED_STATUSES: ApplicationStatus[] = APPLICATION_STATUSES.filter(
  (s) => s !== "saved" && s !== "preparing",
) as ApplicationStatus[];

/** A response from the employer: anything past acknowledgement, plus rejection. */
export const RESPONDED_STATUSES: ApplicationStatus[] = [
  "under_review",
  "recruiter_contacted",
  "shortlisted",
  "assessment_pending",
  "assessment_completed",
  "interview_scheduling",
  "interview_scheduled",
  "interview_completed",
  "next_round",
  "hr_round",
  "offer_received",
  "offer_accepted",
  "selected",
  "rejected",
];

export const INTERVIEW_STATUSES: ApplicationStatus[] = [
  "interview_scheduling",
  "interview_scheduled",
  "interview_completed",
  "next_round",
  "hr_round",
  "offer_received",
  "offer_accepted",
  "selected",
];

export const OFFER_STATUSES: ApplicationStatus[] = ["offer_received", "offer_accepted", "selected"];

export type StatusTone = "neutral" | "info" | "progress" | "good" | "bad" | "warn";
export function statusTone(s: ApplicationStatus): StatusTone {
  if (s === "rejected" || s === "withdrawn") return "bad";
  if (OFFER_STATUSES.includes(s)) return "good";
  if (INTERVIEW_STATUSES.includes(s) || s === "shortlisted") return "progress";
  if (s === "assessment_pending" || s === "interview_scheduling") return "warn";
  if (s === "saved" || s === "preparing") return "neutral";
  return "info";
}

export const EVENT_TYPES = [
  "job_saved",
  "resume_prepared",
  "cover_letter_generated",
  "application_submitted",
  "confirmation_received",
  "recruiter_reply",
  "assessment_assigned",
  "interview_requested",
  "interview_scheduled",
  "interview_rescheduled",
  "rejection_received",
  "offer_received",
  "follow_up_due",
  "status_changed",
  "note_added",
  "document_exported",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  job_saved: "Job saved",
  resume_prepared: "Resume prepared",
  cover_letter_generated: "Cover letter generated",
  application_submitted: "Application submitted",
  confirmation_received: "Confirmation email received",
  recruiter_reply: "Recruiter replied",
  assessment_assigned: "Assessment assigned",
  interview_requested: "Interview requested",
  interview_scheduled: "Interview scheduled",
  interview_rescheduled: "Interview rescheduled",
  rejection_received: "Rejection received",
  offer_received: "Offer received",
  follow_up_due: "Follow-up due",
  status_changed: "Status changed",
  note_added: "Note added",
  document_exported: "Documents exported",
};

export const FACT_SOURCES = ["user_verified", "document_extracted", "ai_suggested", "hypothetical", "unverified"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];
export const FACT_SOURCE_LABEL: Record<FactSource, string> = {
  user_verified: "Verified by you",
  document_extracted: "From your document (unconfirmed)",
  ai_suggested: "AI suggestion (unconfirmed)",
  hypothetical: "Hypothetical example",
  unverified: "Unverified",
};
