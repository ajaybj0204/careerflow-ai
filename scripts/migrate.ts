/**
 * Applies database migrations.
 *   Local PGlite (default):  npm run db:migrate
 *   Supabase / Postgres:     DATABASE_URL=postgres://... npm run db:migrate
 * For Supabase, `supabase db push` with the Supabase CLI is equivalent and also recommended.
 */
import { createPGliteDatabase, createPostgresDatabase, findRepoRoot, migrate } from "@careerflow/database";
import path from "node:path";

const url = process.env.DATABASE_URL;
const db = url ? await createPostgresDatabase(url) : await createPGliteDatabase(path.join(findRepoRoot(), ".data", "pglite"));
const ran = await migrate(db, { log: (m) => console.log(m) });
console.log(ran.length ? `Applied ${ran.length} migration(s).` : "Database is up to date.");
await db.close();
