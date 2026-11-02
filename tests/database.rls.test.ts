import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@careerflow/database";
import { createUser, freshDb } from "./helpers";

let db: Database;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await freshDb();
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
});
afterAll(() => db.close());

describe("database and row level security", () => {
  it("bootstraps profile rows for new users", async () => {
    const p = await db.withUser(alice, (tx) => tx.one("select * from profiles"));
    expect(p?.email).toBe("alice@example.test");
    const cp = await db.withUser(alice, (tx) => tx.query("select * from career_profiles"));
    expect(cp).toHaveLength(1);
  });

  it("isolates applications between users", async () => {
    await db.withUser(alice, (tx) =>
      tx.query("insert into applications (user_id, company, role_title) values ($1, 'Razorpay', 'Payments Ops')", [alice]),
    );
    const mine = await db.withUser(alice, (tx) => tx.query("select * from applications"));
    const theirs = await db.withUser(bob, (tx) => tx.query("select * from applications"));
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(0);
  });

  it("blocks writing rows for another user", async () => {
    await expect(
      db.withUser(bob, (tx) =>
        tx.query("insert into applications (user_id, company, role_title) values ($1, 'X', 'Y')", [alice]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("blocks updating another user's rows (zero rows affected)", async () => {
    const res = await db.withUser(bob, (tx) => tx.query("update applications set company = 'hacked' returning id"));
    expect(res).toHaveLength(0);
  });

  it("hides OAuth token columns from the user role", async () => {
    await db.asService((tx) =>
      tx.query(
        "insert into gmail_connections (user_id, google_email, encrypted_refresh_token) values ($1, 'a@gmail.com', 'cipher')",
        [alice],
      ),
    );
    const ok = await db.withUser(alice, (tx) => tx.one("select google_email, status from gmail_connections"));
    expect(ok?.google_email).toBe("a@gmail.com");
    await expect(
      db.withUser(alice, (tx) => tx.query("select encrypted_refresh_token from gmail_connections")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the event log append-only for users", async () => {
    await db.withUser(alice, (tx) =>
      tx.query("insert into application_events (user_id, type) values ($1, 'note_added')", [alice]),
    );
    await expect(db.withUser(alice, (tx) => tx.query("update application_events set type = 'job_saved'"))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("shows built-in portals to everyone", async () => {
    const rows = await db.withUser(bob, (tx) => tx.query("select slug from job_sources"));
    expect(rows.length).toBe(15);
    const scenarios = await db.withUser(bob, (tx) => tx.query("select slug from interview_scenarios"));
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("handles array and json parameters", async () => {
    const row = await db.withUser(alice, (tx) =>
      tx.one<{ target_roles: string[] }>(
        "update career_profiles set target_roles = $1::text[] returning target_roles",
        [["Business Analyst", "Data Analyst"]],
      ),
    );
    expect(row?.target_roles).toEqual(["Business Analyst", "Data Analyst"]);
  });
});
