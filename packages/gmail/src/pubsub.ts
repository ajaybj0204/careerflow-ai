import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * Verifies the OIDC token that Google Cloud Pub/Sub attaches to authenticated push requests.
 * Configure the push subscription with "Enable authentication", a service account, and an audience
 * equal to PUBSUB_PUSH_AUDIENCE.
 */
export async function verifyPubSubPush(authorization: string | null, opts: { audience: string; serviceAccountEmail?: string }): Promise<boolean> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: opts.audience,
    });
    if (opts.serviceAccountEmail && payload.email !== opts.serviceAccountEmail) return false;
    return payload.email_verified === true || payload.email_verified === undefined;
  } catch {
    return false;
  }
}

/** Decodes a Gmail push notification body: {"message":{"data": base64({"emailAddress","historyId"})}} */
export function decodeGmailPush(body: any): { emailAddress: string; historyId: string } | null {
  try {
    const data = JSON.parse(Buffer.from(body?.message?.data ?? "", "base64").toString("utf8"));
    if (typeof data.emailAddress === "string" && data.historyId) return { emailAddress: data.emailAddress.toLowerCase(), historyId: String(data.historyId) };
  } catch {
    /* invalid payload */
  }
  return null;
}
