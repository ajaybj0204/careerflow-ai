import "server-only";

/**
 * In-memory fixed-window rate limiter. Protects AI and integration endpoints from abuse.
 * Note: per server instance. For multi-instance production, back this with Redis/Upstash (see SECURITY.md).
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

export function assertRateLimit(userId: string, bucket: string, limit = 30, windowMs = 60_000) {
  const r = rateLimit(`${bucket}:${userId}`, limit, windowMs);
  if (!r.ok) throw new Error(`Too many requests. Please wait ${r.retryAfterSec} seconds.`);
}
