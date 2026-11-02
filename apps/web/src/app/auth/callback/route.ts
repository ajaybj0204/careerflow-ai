import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@careerflow/database";
import { appUrl, safeNext } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase";

/** Supabase OAuth callback: exchanges the code for a session cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!code) return NextResponse.redirect(`${appUrl()}/login?error=callback`);
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${appUrl()}/login?error=callback`);
  const db = await getDatabase();
  const p = await db.withUser(data.user.id, (tx) => tx.one<{ onboarding_completed: boolean }>("select onboarding_completed from profiles limit 1"));
  return NextResponse.redirect(`${appUrl()}${p?.onboarding_completed ? next : "/app/onboarding"}`);
}
