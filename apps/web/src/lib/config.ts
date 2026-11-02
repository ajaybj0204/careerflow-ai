import "server-only";

/** Which integrations are configured. Shown in Settings so nothing is presented as connected when it is not. */
export function integrationStatus() {
  return {
    authMode: authMode(),
    supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    database: process.env.DATABASE_URL ? "postgres" : "local (PGlite)",
    storage: process.env.SUPABASE_SERVICE_ROLE_KEY ? "Supabase Storage" : "local disk",
    googleOAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    tokenEncryption: !!process.env.TOKEN_ENCRYPTION_KEY,
    gmailPush: !!process.env.GMAIL_PUBSUB_TOPIC,
    ai: !!process.env.GEMINI_API_KEY,
    aiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    cronSecret: !!process.env.CRON_SECRET,
  };
}

export function authMode(): "supabase" | "local" {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "local";
}

export function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100").replace(/\/$/, "");
}

/** Local test sign-in is allowed only outside production unless explicitly enabled. */
export function localAuthAllowed() {
  return authMode() === "local" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_AUTH === "true");
}

/** Only same-site relative paths are allowed as redirect targets. */
export function safeNext(next: string | null | undefined, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
