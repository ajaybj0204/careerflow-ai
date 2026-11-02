import fs from "node:fs";
import path from "node:path";
import type { Database } from "./client";
import { findRepoRoot } from "./client";

/**
 * Applies supabase/migrations in order, once each.
 * Local (PGlite): applies supabase/local/auth_shim.sql first and skips *.supabase.sql files.
 * Supabase: the Supabase CLI (`supabase db push`) is the recommended path; this runner also works.
 */
export async function migrate(db: Database, opts: { root?: string; log?: (m: string) => void } = {}) {
  const root = opts.root ?? findRepoRoot();
  const log = opts.log ?? (() => {});
  const local = db.kind === "pglite";
  const dir = path.join(root, "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !(local && f.endsWith(".supabase.sql")))
    .sort();

  await db.asOwner(async (tx) => {
    if (local) await tx.exec(fs.readFileSync(path.join(root, "supabase", "local", "auth_shim.sql"), "utf8"));
    await tx.exec("create schema if not exists cf_meta");
    await tx.exec("create table if not exists cf_meta.migrations (name text primary key, applied_at timestamptz not null default now())");
  });

  const applied = new Set(
    (await db.asOwner((tx) => tx.query<{ name: string }>("select name from cf_meta.migrations"))).map((r) => r.name),
  );
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.asOwner(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into cf_meta.migrations (name) values ($1)", [f]);
    });
    log("applied " + f);
    ran.push(f);
  }
  return ran;
}
