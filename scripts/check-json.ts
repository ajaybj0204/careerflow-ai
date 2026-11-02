// Verifies JSON parameters are stored as objects on the configured Postgres (rolls back; writes nothing).
import { createPostgresDatabase } from "@careerflow/database";
const db = await createPostgresDatabase(process.env.DATABASE_URL!);
try {
  await db.asOwner(async (tx) => {
    const r = await tx.one<{ t: string; v: any }>("select jsonb_typeof($1::jsonb) as t, $1::jsonb as v", [JSON.stringify({ a: 1, list: [1, 2] })]);
    console.log("stored type:", r?.t, "| read back as:", typeof r?.v, JSON.stringify(r?.v));
    throw new Error("rollback");
  });
} catch (e) { if ((e as Error).message !== "rollback") throw e; }
await db.close();
