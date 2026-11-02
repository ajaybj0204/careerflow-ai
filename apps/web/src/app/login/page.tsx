import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@careerflow/database";
import { appUrl, authMode, localAuthAllowed, safeNext } from "@/lib/config";
import { createLocalSession, getSessionUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { CreatedBy, Logo } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

async function googleSignIn(form: FormData) {
  "use server";
  const sb = await supabaseServer();
  const next = safeNext(String(form.get("next") ?? ""));
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`, scopes: "openid email profile" },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

async function localSignIn(form: FormData) {
  "use server";
  if (!localAuthAllowed()) redirect("/login?error=disabled");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/login?error=email");
  if (!rateLimit(`login:${email}`, 10, 60_000).ok) redirect("/login?error=rate");
  const db = await getDatabase();
  const user = await db.asService(async (tx) => {
    const existing = await tx.one<{ id: string }>("select id from auth.users where email = $1", [email]);
    if (existing) return existing;
    return tx.one<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [email, JSON.stringify({ full_name: name || null })]);
  });
  await createLocalSession(user!.id, email);
  const isNew = await db.withUser(user!.id, (tx) => tx.one<{ onboarding_completed: boolean }>("select onboarding_completed from profiles limit 1"));
  redirect(isNew?.onboarding_completed ? safeNext(String(form.get("next") ?? "")) : "/app/onboarding");
}

const ERRORS: Record<string, string> = {
  oauth: "Google sign-in could not start. Check the Supabase Google provider settings.",
  callback: "Sign-in did not complete. Please try again.",
  email: "Enter a valid email address.",
  disabled: "Local sign-in is disabled in this environment.",
  rate: "Too many attempts. Please wait a minute.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect(safeNext(sp.next));
  const mode = authMode();
  return (
    <main className="aurora flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="card card-glow pop-in w-full max-w-sm p-8 shadow-[var(--shadow-lg)]">
        <Link href="/">
          <Logo size={40} />
        </Link>
        <h1 className="mt-6 text-2xl font-extrabold">
          Welcome <span className="text-gradient">back</span>
        </h1>
        <p className="mt-1 text-sm text-ink-2">Gmail access is requested separately, later, only if you choose to connect it.</p>
        {sp.error && (
          <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
            {ERRORS[sp.error] ?? "Sign-in failed."}
          </p>
        )}
        {mode === "supabase" ? (
          <form action={googleSignIn} className="mt-6">
            <input type="hidden" name="next" value={sp.next ?? ""} />
            <button className="btn btn-secondary w-full py-2.5">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
              </svg>
              Continue with Google
            </button>
          </form>
        ) : localAuthAllowed() ? (
          <form action={localSignIn} className="mt-6 space-y-3">
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              Test mode: Supabase is not configured, so this is a local development sign-in with no password. Data stays on this computer.
            </p>
            <input type="hidden" name="next" value={sp.next ?? ""} />
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" required className="input" autoComplete="email" />
            </div>
            <button className="btn btn-primary w-full py-2.5">Continue</button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-bad">Authentication is not configured. Set the Supabase environment variables.</p>
        )}
      </div>
      <CreatedBy className="fade-in" />
    </main>
  );
}
