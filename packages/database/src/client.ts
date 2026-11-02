import fs from "node:fs";
import path from "node:path";

/** A query runner bound to one transaction. Use $1, $2... placeholders. */
export interface Tx {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T | null>;
  /** Runs several statements with no parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface Database {
  /** Runs fn as the signed-in user. Row Level Security limits every query to that user's rows. */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Runs fn with the server role (bypasses RLS). Only for trusted server code: automation, token storage, sign-up. */
  asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Runs fn as the connecting database owner (no role switch). Only for schema migrations. */
  asOwner<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  readonly kind: "pglite" | "postgres";
  close(): Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function claims(userId: string) {
  if (!UUID_RE.test(userId)) throw new Error("Invalid user id");
  return JSON.stringify({ sub: userId, role: "authenticated" });
}

function makeTx(run: (text: string, params?: unknown[]) => Promise<any[]>, exec: (text: string) => Promise<unknown>): Tx {
  return {
    query: (text, params) => run(text, params),
    one: async (text, params) => (await run(text, params))[0] ?? null,
    exec: async (text) => {
      await exec(text);
    },
  };
}

// ---------------------------------------------------------------------------
// PGlite (local development and tests): real Postgres compiled to WebAssembly
// ---------------------------------------------------------------------------
export async function createPGliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;

  const wrap = (tx: any) =>
    makeTx(
      async (text, params) => (await tx.query(text, params ?? [])).rows,
      (text) => tx.exec(text),
    );

  return {
    kind: "pglite",
    async withUser(userId, fn) {
      const c = claims(userId);
      return pg.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [c]);
        await tx.query("set local role authenticated");
        return fn(wrap(tx));
      }) as Promise<any>;
    },
    async asService(fn) {
      return pg.transaction(async (tx) => fn(wrap(tx))) as Promise<any>;
    },
    async asOwner(fn) {
      return pg.transaction(async (tx) => fn(wrap(tx))) as Promise<any>;
    },
    async close() {
      await pg.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Postgres (Supabase in production). Use the transaction pooler URL (port 6543).
// ---------------------------------------------------------------------------
export async function createPostgresDatabase(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });
  const wrap = (tx: any) =>
    makeTx(
      async (text, params) => [...(await tx.unsafe(text, (params ?? []) as any[]))],
      (text) => tx.unsafe(text),
    );
  return {
    kind: "postgres",
    async withUser(userId, fn) {
      const c = claims(userId);
      return sql.begin(async (tx: any) => {
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [c]);
        await tx.unsafe("set local role authenticated");
        return fn(wrap(tx));
      }) as Promise<any>;
    },
    async asService(fn) {
      return sql.begin(async (tx: any) => {
        await tx.unsafe("set local role service_role");
        return fn(wrap(tx));
      }) as Promise<any>;
    },
    async asOwner(fn) {
      return sql.begin(async (tx: any) => fn(wrap(tx))) as Promise<any>;
    },
    async close() {
      await sql.end();
    },
  };
}

/** Finds the repository root (the folder that contains supabase/migrations). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "supabase", "migrations"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find supabase/migrations above " + start);
    dir = parent;
  }
}
