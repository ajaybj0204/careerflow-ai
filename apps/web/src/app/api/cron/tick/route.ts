import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { schedulerTick } from "@careerflow/core";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return got.length === secret.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

/**
 * Background scheduler tick: queues Gmail polling, watch renewals, alerts, follow-ups and reminders,
 * then runs due jobs. Called by Vercel Cron or the standalone worker (apps/worker). Never by browsers.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDatabase();
  const r = await schedulerTick(db, { workerId: `cron-${crypto.randomUUID().slice(0, 8)}`, limit: Number(process.env.JOBS_PER_TICK ?? 25) });
  return NextResponse.json({ ok: true, gmailQueued: r.gmailQueued, jobs: r.ran.map((j) => ({ type: j.type, ok: j.ok, error: j.error })) });
}

export const GET = handle;
export const POST = handle;
