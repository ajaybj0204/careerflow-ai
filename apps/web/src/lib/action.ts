import "server-only";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ZodError } from "zod";

export interface ActionState {
  ok: boolean;
  message?: string;
  data?: any;
  at?: number;
}

export const initialState: ActionState = { ok: false };

/** Wraps a server action: converts errors into a user-facing message and revalidates paths. */
export async function act(fn: () => Promise<{ message?: string; data?: any } | void>, revalidate: string[] = []): Promise<ActionState> {
  try {
    const r = (await fn()) ?? {};
    for (const p of revalidate) revalidatePath(p, "page");
    return { ok: true, message: r.message, data: r.data, at: Date.now() };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ZodError) return { ok: false, message: e.issues.map((i) => i.message).join(". "), at: Date.now() };
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    if (process.env.NODE_ENV !== "production") console.error(e);
    return { ok: false, message: msg.length > 400 ? "Something went wrong. Please try again." : msg, at: Date.now() };
  }
}

export const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (f: FormData, k: string) => str(f, k) || null;
export const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number(v);
};
export const list = (f: FormData, k: string) =>
  str(f, k)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
export async function fileFrom(f: FormData, k: string) {
  const v = f.get(k);
  if (!v || typeof v === "string" || v.size === 0) return null;
  return { name: v.name, mime: v.type || "application/octet-stream", data: Buffer.from(await v.arrayBuffer()) };
}
