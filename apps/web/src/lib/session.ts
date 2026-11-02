import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findRepoRoot, getDatabase } from "@careerflow/database";
import { authMode } from "./config";
import { supabaseServer } from "./supabase";

export interface SessionUser {
  id: string;
  email: string | null;
}

const COOKIE = "cf_session";

/** Secret for signing local-mode session cookies and OAuth state. */
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production.");
  const file = path.join(findRepoRoot(), ".data", "session-secret");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return fs.readFileSync(file, "utf8").trim();
}

function sign(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export async function createLocalSession(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, email, exp: Date.now() + 14 * 864e5 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 86400,
  });
}

async function localSession(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (data.exp < Date.now()) return null;
  // The user must still exist (deleted accounts lose access immediately)
  const db = await getDatabase();
  const exists = await db.asService((tx) => tx.one("select id from auth.users where id = $1", [data.uid]));
  return exists ? { id: data.uid, email: data.email } : null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (authMode() === "local") return localSession();
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function signOutSession() {
  (await cookies()).delete(COOKIE);
  if (authMode() === "supabase") {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
}

/** Runs fn as the signed-in user with Row Level Security. */
export async function withUser<T>(fn: (tx: import("@careerflow/database").Tx, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  const db = await getDatabase();
  return db.withUser(user.id, (tx) => fn(tx, user));
}

export async function userDb() {
  const user = await requireUser();
  return { user, db: await getDatabase() };
}
