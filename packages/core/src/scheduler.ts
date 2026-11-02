import type { Database } from "@careerflow/database";
import { scheduleFollowUps } from "./applications";
import { enqueueJob, notify, runDueJobs, type JobHandler } from "./automation";
import { incrementalSync, reprocessReviewEmails, renewWatch, runImportPage, schedulePeriodicGmailWork } from "./gmail-sync";
import { runJobAlerts } from "./jobs";
import { refreshStrategy } from "./strategy";

export const JOB_HANDLERS: Record<string, JobHandler> = {
  "gmail.import": async (db, job) => {
    await runImportPage(db, job.user_id!);
  },
  "gmail.sync": async (db, job) => {
    await incrementalSync(db, job.user_id!);
  },
  "gmail.reprocess": async (db, job) => {
    const r = await reprocessReviewEmails(db, job.user_id!, 20);
    if (r.more) await db.asService((tx) => enqueueJob(tx, { userId: job.user_id, type: "gmail.reprocess", dedupeKey: `gmail.reprocess:${job.user_id}:${Date.now()}` }));
  },
  "gmail.renew_watch": async (db, job) => {
    await renewWatch(db, job.user_id!);
  },
  "jobs.alerts": async (db, job) => {
    await runJobAlerts(db, job.user_id!);
  },
  "followups.scan": async (db, job) => {
    await db.withUser(job.user_id!, (tx) => scheduleFollowUps(tx, job.user_id!, Number(job.payload.days ?? 10)));
  },
  "strategy.refresh": async (db, job) => {
    await refreshStrategy(db, job.user_id!);
  },
  "reminders.scan": async (db, job) => {
    const uid = job.user_id!;
    await db.withUser(uid, async (tx) => {
      const due = await tx.query("select s.id, s.title, s.deadline, a.company from assessments s left join applications a on a.id = s.application_id where s.status = 'pending' and s.deadline between now() and now() + interval '24 hours'");
      for (const d of due) await notify(tx, uid, { type: "assessment_deadline", title: `Assessment due soon${d.company ? ` — ${d.company}` : ""}`, body: d.title, link: "/app/calendar", dedupeKey: `deadline:${d.id}` });
      await tx.query("update assessments set status = 'expired' where status = 'pending' and deadline < now() - interval '1 day'");
    });
  },
};

/**
 * One scheduler tick. Called by Vercel Cron (/api/cron/tick) or the standalone worker.
 * Queues periodic work, then runs due jobs. Works without any browser open.
 */
export async function schedulerTick(db: Database, opts: { workerId: string; limit?: number; budgetMs?: number }) {
  const gmailQueued = await schedulePeriodicGmailWork(db, { pollMinutes: Number(process.env.GMAIL_POLL_MINUTES ?? 30) });
  const day = new Date().toISOString().slice(0, 10);
  const hour = new Date().toISOString().slice(0, 13);
  const users = await db.asService((tx) => tx.query<{ id: string }>("select id from profiles"));
  await db.asService(async (tx) => {
    for (const u of users) {
      await enqueueJob(tx, { userId: u.id, type: "followups.scan", dedupeKey: `followups:${u.id}:${day}`, once: true });
      await enqueueJob(tx, { userId: u.id, type: "reminders.scan", dedupeKey: `reminders:${u.id}:${hour}`, once: true });
      await enqueueJob(tx, { userId: u.id, type: "strategy.refresh", dedupeKey: `strategy:${u.id}:${day}`, once: true });
    }
    const alertUsers = await tx.query<{ user_id: string }>("select distinct user_id from job_alerts where active");
    for (const a of alertUsers) await enqueueJob(tx, { userId: a.user_id, type: "jobs.alerts", dedupeKey: `alerts:${a.user_id}:${hour}`, maxAttempts: 2, once: true });
  });
  const ran = await runDueJobs(db, JOB_HANDLERS, { workerId: opts.workerId, limit: opts.limit ?? 25, budgetMs: opts.budgetMs ?? 40_000 });
  return { gmailQueued, ran };
}
