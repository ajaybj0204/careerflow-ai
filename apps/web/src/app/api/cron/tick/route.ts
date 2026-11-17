import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { isSchedulerToken, schedulerTick } from "@careerflow/core";

export const maxDuration = 60;

/**
 * Accepts CRON_SECRET (Vercel Cron, GitHub Actions, worker) or a scheduler token whose SHA-256 hash is in
 * scheduler_tokens (Supabase pg_cron, every 15 minutes). Without either configured, only development runs it.
 */
async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got) return !secret && process.env.NODE_ENV !== "production";
  if (secret && got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return true;
  return isSchedulerToken(await getDatabase(), got);
}

/**
 * Background scheduler tick: queues Gmail polling, watch renewals, alerts, follow-ups and reminders,
 * then runs due jobs. Called by Supabase pg_cron (every 15 min), GitHub Actions, Vercel Cron or the standalone worker (apps/worker). Never by browsers.
 */
async function handle(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDatabase();
  const r = await schedulerTick(db, { workerId: `cron-${crypto.randomUUID().slice(0, 8)}`, limit: Number(process.env.JOBS_PER_TICK ?? 25) });
  return NextResponse.json({ ok: true, gmailQueued: r.gmailQueued, jobs: r.ran.map((j) => ({ type: j.type, ok: j.ok, error: j.error })) });
}

export const GET = handle;
export const POST = handle;
