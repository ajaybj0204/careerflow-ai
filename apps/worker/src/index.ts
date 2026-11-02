/**
 * CareerFlow background worker.
 *
 * Calls the app's scheduler endpoint on an interval so Gmail sync, imports, alerts, follow-ups and
 * reminders run without any browser open. Run it anywhere that can reach the app:
 *   APP_URL=https://your-app.vercel.app CRON_SECRET=... npm run worker
 * Locally (default): APP_URL=http://localhost:3100.
 */
const APP_URL = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const INTERVAL = Math.max(15, Number(process.env.WORKER_INTERVAL_SECONDS ?? 60)) * 1000;

let stopping = false;
let failures = 0;

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${APP_URL}/api/cron/tick`, {
      method: "POST",
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
      signal: AbortSignal.timeout(120_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    failures = 0;
    const ran = (body.jobs ?? []) as { type: string; ok: boolean; error?: string }[];
    if (ran.length || body.gmailQueued)
      console.log(
        `[${new Date().toISOString()}] queued ${body.gmailQueued ?? 0} gmail job(s); ran ${ran.length}: ${ran.map((j) => `${j.type}${j.ok ? "" : ` (failed: ${j.error})`}`).join(", ")} in ${Date.now() - started}ms`,
      );
  } catch (e) {
    failures++;
    console.error(`[${new Date().toISOString()}] tick failed (${failures}): ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log(`CareerFlow worker → ${APP_URL} every ${INTERVAL / 1000}s${SECRET ? "" : " (no CRON_SECRET: only works against a development server)"}`);
  while (!stopping) {
    await tick();
    // Back off when the app is unreachable, up to 10 minutes
    const wait = failures ? Math.min(600_000, INTERVAL * 2 ** Math.min(failures, 5)) : INTERVAL;
    await new Promise((r) => setTimeout(r, wait));
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    console.log("Worker stopping…");
    setTimeout(() => process.exit(0), 500);
  });

main();
