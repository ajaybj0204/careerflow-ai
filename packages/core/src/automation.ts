/**
 * ENGINE B — Career Automation.
 * Central event log, guarded status transitions, notifications and a retrying job queue.
 */
import { STATUS_LABEL, STATUS_RANK, type ApplicationStatus, type EventType } from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";

export type EventSource = "manual" | "gmail" | "extension" | "system";

export async function recordEvent(
  tx: Tx,
  userId: string,
  e: { applicationId?: string | null; type: EventType; occurredAt?: Date | string | null; source?: EventSource; payload?: Record<string, unknown>; dedupeKey?: string | null },
): Promise<boolean> {
  const rows = await tx.query(
    `insert into application_events (user_id, application_id, type, occurred_at, source, payload, dedupe_key)
     values ($1,$2,$3,coalesce($4::timestamptz, now()),$5,$6::jsonb,$7)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`,
    [userId, e.applicationId ?? null, e.type, e.occurredAt ?? null, e.source ?? "system", JSON.stringify(e.payload ?? {}), e.dedupeKey ?? null],
  );
  if (rows.length && e.applicationId) await tx.query("update applications set last_activity_at = greatest(last_activity_at, coalesce($2::timestamptz, now())) where id = $1", [e.applicationId, e.occurredAt ?? null]);
  return rows.length > 0;
}

export type StatusResult = "applied" | "unchanged" | "needs_review" | "skipped";

/** High-impact outcomes need strong evidence before automation applies them. */
const HIGH_IMPACT: ApplicationStatus[] = ["rejected", "withdrawn", "offer_received", "offer_accepted", "selected"];
export const AUTO_APPLY_CONFIDENCE = 0.85;

/**
 * Changes an application's status with safety rules:
 * - Manual changes always apply and mark the status as yours (status_locked).
 * - Automation never applies an outcome (rejection/offer/withdrawal) over your status; it asks via review.
 * - Automation only moves forward in the pipeline (never backwards).
 * - Rejections, offers and withdrawals need confidence >= 0.85, otherwise they go to review.
 */
export async function changeStatus(
  tx: Tx,
  userId: string,
  applicationId: string,
  to: ApplicationStatus,
  opts: { source: EventSource; reason?: string; confidence?: number; evidenceMessageId?: string | null; occurredAt?: Date | string | null },
): Promise<StatusResult> {
  const app = await tx.one<{ status: ApplicationStatus; status_locked: boolean; company: string; role_title: string }>(
    "select status, status_locked, company, role_title from applications where id = $1 for update",
    [applicationId],
  );
  if (!app) throw new Error("Application not found");
  if (app.status === to) return "unchanged";
  const automated = opts.source !== "manual";
  if (automated) {
    const conf = opts.confidence ?? 0;
    const backwards = STATUS_RANK[to] < STATUS_RANK[app.status];
    const lowEvidence = HIGH_IMPACT.includes(to) && conf < AUTO_APPLY_CONFIDENCE;
    const terminalAlready = ["rejected", "withdrawn", "offer_accepted", "selected"].includes(app.status);
    if (backwards && !HIGH_IMPACT.includes(to)) return "skipped";
    // A status you set yourself is never overwritten by an outcome (rejection/offer/withdrawal) without
    // your confirmation. Ordinary forward progress (e.g. applied -> assessment pending) still applies.
    const lockedOutcome = app.status_locked && HIGH_IMPACT.includes(to);
    if (lockedOutcome || lowEvidence || terminalAlready) {
      await tx.query(
        `insert into review_queue (user_id, kind, processed_message_id, application_id, suggestion, confidence)
         values ($1,'status_change',$2,$3,$4::jsonb,$5)`,
        [userId, opts.evidenceMessageId ?? null, applicationId, JSON.stringify({ from: app.status, to, reason: opts.reason ?? null, locked: app.status_locked }), conf],
      );
      await notify(tx, userId, {
        type: "review_needed",
        title: `Check a status update for ${app.company}`,
        body: `An email suggests "${STATUS_LABEL[to]}" for ${app.role_title}. Please confirm before it is applied.`,
        link: "/app/review",
        dedupeKey: `review:${applicationId}:${to}:${opts.evidenceMessageId ?? ""}`,
      });
      return "needs_review";
    }
  }
  await tx.query(
    `update applications set status = $2, status_source = $3, status_locked = case when $3 = 'manual' then true else status_locked end,
       applied_at = case when $2 = 'applied' and applied_at is null and $3 in ('manual','extension') then coalesce($4::timestamptz, now()) else applied_at end
     where id = $1`,
    [applicationId, to, opts.source, opts.occurredAt ?? null],
  );
  await tx.query(
    "insert into status_history (user_id, application_id, from_status, to_status, source, reason, confidence, evidence_message_id) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [userId, applicationId, app.status, to, opts.source, opts.reason ?? null, opts.confidence ?? null, opts.evidenceMessageId ?? null],
  );
  await recordEvent(tx, userId, {
    applicationId,
    type: "status_changed",
    source: opts.source,
    occurredAt: opts.occurredAt ?? null,
    payload: { from: app.status, to, reason: opts.reason ?? null, confidence: opts.confidence ?? null },
  });
  return "applied";
}

export type NotificationType =
  | "new_matching_job"
  | "application_detected"
  | "recruiter_reply"
  | "status_update"
  | "assessment_received"
  | "assessment_deadline"
  | "interview_invitation"
  | "interview_rescheduled"
  | "offer_received"
  | "follow_up_due"
  | "gmail_sync_failure"
  | "authorization_expired"
  | "review_needed";

/** Creates an in-app notification unless the user turned that type off. Deduplicated by key. */
export async function notify(tx: Tx, userId: string, n: { type: NotificationType; title: string; body?: string; link?: string; dedupeKey?: string }) {
  const prefs = await tx.one<{ notification_prefs: Record<string, boolean> }>("select notification_prefs from user_preferences where user_id = $1", [userId]);
  if (prefs?.notification_prefs?.[n.type] === false) return false;
  const rows = await tx.query(
    `insert into notifications (user_id, type, title, body, link, dedupe_key) values ($1,$2,$3,$4,$5,$6)
     on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`,
    [userId, n.type, n.title.slice(0, 200), n.body?.slice(0, 1000) ?? null, n.link ?? null, n.dedupeKey ?? null],
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Job queue (runs in the background worker / cron endpoint, never in the browser)
// ---------------------------------------------------------------------------
export async function enqueueJob(tx: Tx, job: { userId: string | null; type: string; payload?: Record<string, unknown>; runAfter?: Date; dedupeKey?: string; maxAttempts?: number }) {
  const rows = await tx.query(
    `insert into automation_jobs (user_id, type, payload, run_after, dedupe_key, max_attempts) values ($1,$2,$3::jsonb,coalesce($4::timestamptz, now()),$5,$6)
     on conflict (dedupe_key) where dedupe_key is not null and status in ('queued','running') do nothing returning id`,
    [job.userId, job.type, JSON.stringify(job.payload ?? {}), job.runAfter?.toISOString() ?? null, job.dedupeKey ?? null, job.maxAttempts ?? 5],
  );
  return rows[0]?.id as string | undefined;
}

export interface JobRow {
  id: string;
  user_id: string | null;
  type: string;
  payload: Record<string, any>;
  attempts: number;
  max_attempts: number;
}

export type JobHandler = (db: Database, job: JobRow) => Promise<void>;

export function backoffMs(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 2 ** attempts * 60 * 1000);
}

/** Claims due jobs, runs them, and records success, retry (with backoff) or permanent failure. */
export async function runDueJobs(db: Database, handlers: Record<string, JobHandler>, opts: { workerId: string; limit?: number; now?: Date } = { workerId: "worker" }) {
  await db.asService((tx) => tx.query("update automation_jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '15 minutes'"));
  const jobs = await db.asService((tx) =>
    tx.query<JobRow>(
      `update automation_jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
       where id in (select id from automation_jobs where status = 'queued' and run_after <= coalesce($3::timestamptz, now()) order by run_after limit $2 for update skip locked)
       returning id, user_id, type, payload, attempts, max_attempts`,
      [opts.workerId, opts.limit ?? 20, opts.now?.toISOString() ?? null],
    ),
  );
  const results: { id: string; type: string; ok: boolean; error?: string }[] = [];
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(db, job);
      await db.asService((tx) => tx.query("update automation_jobs set status = 'succeeded', finished_at = now(), last_error = null where id = $1", [job.id]));
      results.push({ id: job.id, type: job.type, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const dead = job.attempts >= job.max_attempts;
      await db.asService(async (tx) => {
        await tx.query(
          `update automation_jobs set status = $2, last_error = $3, run_after = now() + ($4 || ' milliseconds')::interval, finished_at = case when $2 = 'dead' then now() else null end where id = $1`,
          [job.id, dead ? "dead" : "queued", msg.slice(0, 500), String(backoffMs(job.attempts))],
        );
        await tx.query("insert into automation_errors (user_id, job_id, job_type, error, context) values ($1,$2,$3,$4,$5::jsonb)", [
          job.user_id,
          job.id,
          job.type,
          msg.slice(0, 1000),
          JSON.stringify({ attempt: job.attempts, dead }),
        ]);
      });
      results.push({ id: job.id, type: job.type, ok: false, error: msg });
    }
  }
  return results;
}
