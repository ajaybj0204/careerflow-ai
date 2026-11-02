import { createTestDatabase, type Database } from "@careerflow/database";

/** Creates an auth user (and, via trigger, their profile rows). Returns the user id. */
export async function createUser(db: Database, email: string): Promise<string> {
  const row = await db.asService((tx) =>
    tx.one<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [
      email,
      JSON.stringify({ full_name: email.split("@")[0] }),
    ]),
  );
  return row!.id;
}

export async function freshDb(): Promise<Database> {
  return createTestDatabase();
}
