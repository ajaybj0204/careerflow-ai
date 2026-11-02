import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@careerflow/database";
import { emailFromIdToken, exchangeCode, googleOAuthConfig, verifyState } from "@careerflow/gmail";
import { enqueueJob, renewWatch, saveGmailConnection } from "@careerflow/core";
import { appUrl } from "@/lib/config";
import { getSessionUser, sessionSecret } from "@/lib/session";

/** Google redirects here after consent. The state value binds the response to the signed-in user. */
export async function GET(req: NextRequest) {
  const base = `${appUrl()}/app/settings`;
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return NextResponse.redirect(`${base}?gmail=denied#gmail`);
  const user = await getSessionUser();
  const state = verifyState(sp.get("state") ?? "", sessionSecret());
  if (!user || !state || state.uid !== user.id) return NextResponse.redirect(`${base}?gmail=error#gmail`);
  const cfg = googleOAuthConfig(appUrl());
  if (!cfg) return NextResponse.redirect(`${base}?gmail=notconfigured#gmail`);
  try {
    const t = await exchangeCode(cfg, sp.get("code") ?? "");
    if (!t.scopes.includes("https://www.googleapis.com/auth/gmail.readonly")) return NextResponse.redirect(`${base}?gmail=denied#gmail`);
    if (!t.refreshToken) return NextResponse.redirect(`${base}?gmail=norefresh#gmail`);
    const email = emailFromIdToken(t.idToken) ?? user.email ?? "unknown";
    const db = await getDatabase();
    await saveGmailConnection(db, user.id, { googleEmail: email, refreshToken: t.refreshToken, accessToken: t.accessToken, expiresAt: t.expiresAt, scopes: t.scopes });
    // Start push notifications if configured; the scheduler also renews them. Errors fall back to polling.
    await renewWatch(db, user.id).catch(() => {});
    await db.asService((tx) => enqueueJob(tx, { userId: user.id, type: "gmail.sync", dedupeKey: `gmail.sync:${user.id}` }));
    return NextResponse.redirect(`${base}?gmail=connected#gmail`);
  } catch {
    return NextResponse.redirect(`${base}?gmail=error#gmail`);
  }
}
