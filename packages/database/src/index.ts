import path from "node:path";
import { createPGliteDatabase, createPostgresDatabase, findRepoRoot, type Database } from "./client";
import { migrate } from "./migrate";

export * from "./client";
export { migrate } from "./migrate";

const g = globalThis as unknown as { __careerflowDb?: Promise<Database> };

/**
 * Process-wide database. DATABASE_URL set -> Postgres/Supabase. Otherwise a local PGlite database in
 * <repo>/.data/pglite, migrated automatically (local development only).
 */
export function getDatabase(): Promise<Database> {
  if (!g.__careerflowDb) {
    g.__careerflowDb = (async () => {
      const url = process.env.DATABASE_URL;
      if (url) return createPostgresDatabase(url);
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB_IN_PRODUCTION !== "true") {
        throw new Error("DATABASE_URL is not set. The local PGlite database is for development only.");
      }
      const dataDir = process.env.CAREERFLOW_DATA_DIR ?? path.join(findRepoRoot(), ".data", "pglite");
      const db = await createPGliteDatabase(dataDir);
      await migrate(db);
      return db;
    })();
    g.__careerflowDb.catch(() => (g.__careerflowDb = undefined));
  }
  return g.__careerflowDb;
}

/** Fresh in-memory database for tests. */
export async function createTestDatabase(): Promise<Database> {
  const db = await createPGliteDatabase();
  await migrate(db);
  return db;
}
