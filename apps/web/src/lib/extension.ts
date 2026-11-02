import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { rateLimit } from "./rate-limit";

/** Resolves the user for an extension request from its personal access token (only a SHA-256 hash is stored). */
export async function extensionUser(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(cfx_[\w-]{20,})$/)?.[1];
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const db = await getDatabase();
  const row = await db.asService((tx) => tx.one<{ user_id: string }>("select user_id from user_preferences where extension_token_sha256 = $1", [hash]));
  return row?.user_id ?? null;
}

export function cors(req: Request, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (origin?.startsWith("chrome-extension://")) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("access-control-allow-headers", "authorization, content-type");
    res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    res.headers.set("vary", "origin");
  }
  return res;
}

export async function withExtension(req: Request, fn: (userId: string) => Promise<unknown>) {
  const uid = await extensionUser(req);
  if (!uid) return cors(req, NextResponse.json({ error: "Invalid or missing extension token. Create one in CareerFlow → Settings." }, { status: 401 }));
  if (!rateLimit(`ext:${uid}`, 60, 60_000).ok) return cors(req, NextResponse.json({ error: "Too many requests" }, { status: 429 }));
  try {
    return cors(req, NextResponse.json(await fn(uid)));
  } catch (e) {
    return cors(req, NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 }));
  }
}
