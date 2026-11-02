/**
 * Google OAuth for the separate Gmail connection step.
 * Least privilege: gmail.readonly only (CareerFlow never sends, deletes or modifies email).
 * Note: gmail.readonly is a Google "restricted" scope. Public launch requires OAuth app verification
 * and an annual security assessment (CASA). Until then the app works for listed test users only.
 */
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleOAuthConfig(appUrl: string): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/gmail/callback` };
}

export function buildGmailAuthUrl(cfg: GoogleOAuthConfig, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
  idToken?: string;
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `Token request failed (${res.status})`);
    (err as any).code = json.error;
    throw err;
  }
  return json;
}

export async function exchangeCode(cfg: GoogleOAuthConfig, code: string, fetchImpl?: typeof fetch): Promise<TokenSet> {
  const j = await tokenRequest(
    { code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" },
    fetchImpl,
  );
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
    scopes: String(j.scope ?? "").split(" ").filter(Boolean),
    idToken: j.id_token,
  };
}

export async function refreshAccessToken(cfg: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">, refreshToken: string, fetchImpl?: typeof fetch): Promise<TokenSet> {
  const j = await tokenRequest(
    { refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" },
    fetchImpl,
  );
  return {
    accessToken: j.access_token,
    expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
    scopes: String(j.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  return res.ok;
}

/** Reads the email claim from Google's id_token (already trusted: received directly from Google over TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
