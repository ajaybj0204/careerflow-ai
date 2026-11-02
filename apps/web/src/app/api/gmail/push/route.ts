import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { decodeGmailPush, verifyPubSubPush } from "@careerflow/gmail";
import { enqueueJob } from "@careerflow/core";

/**
 * Google Cloud Pub/Sub push endpoint for Gmail notifications.
 * Authenticated with the OIDC token Pub/Sub attaches (audience PUBSUB_PUSH_AUDIENCE).
 * The notification only queues a sync job; the worker fetches changes via the history API.
 */
export async function POST(req: Request) {
  const audience = process.env.PUBSUB_PUSH_AUDIENCE;
  if (!audience) return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  const ok = await verifyPubSubPush(req.headers.get("authorization"), { audience, serviceAccountEmail: process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const msg = decodeGmailPush(body);
  // Acknowledge malformed messages so Pub/Sub does not retry them forever
  if (!msg) return new NextResponse(null, { status: 204 });
  const db = await getDatabase();
  await db.asService(async (tx) => {
    const conn = await tx.one<{ user_id: string }>("select user_id from gmail_connections where lower(google_email) = $1 and status = 'active'", [msg.emailAddress]);
    if (conn) await enqueueJob(tx, { userId: conn.user_id, type: "gmail.sync", dedupeKey: `gmail.sync:${conn.user_id}` });
  });
  return new NextResponse(null, { status: 204 });
}
