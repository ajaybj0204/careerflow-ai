import { NextResponse } from "next/server";
import { buildGmailAuthUrl, googleOAuthConfig, signState } from "@careerflow/gmail";
import { appUrl } from "@/lib/config";
import { getSessionUser, sessionSecret } from "@/lib/session";

/** Starts the separate, explicit Gmail consent flow (read-only scope). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login?next=/app/settings`);
  const cfg = googleOAuthConfig(appUrl());
  if (!cfg || !process.env.TOKEN_ENCRYPTION_KEY) return NextResponse.redirect(`${appUrl()}/app/settings?gmail=notconfigured#gmail`);
  const state = signState({ uid: user.id }, sessionSecret());
  return NextResponse.redirect(buildGmailAuthUrl(cfg, state, user.email ?? undefined));
}
