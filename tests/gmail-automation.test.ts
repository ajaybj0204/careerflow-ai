import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import type { Database } from "@careerflow/database";
import { classifyEmail, decryptSecret, encryptSecret, signState, verifyState } from "@careerflow/gmail";
import {
  createApplication,
  disconnectGmail,
  enqueueJob,
  incrementalSync,
  processGmailMessage,
  resolveReview,
  runDueJobs,
  runImportPage,
  saveGmailConnection,
  setGmailApiFactory,
  setStatusManually,
  startHistoricalImport,
  GmailAuthError,
} from "@careerflow/core";
import { createUser, freshDb } from "./helpers";
import { FakeGmail, mail } from "./fixtures/gmail";

process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

let db: Database;
let user: string;
let gmail: FakeGmail;

const q = <T = any>(sql: string, p: unknown[] = []) => db.withUser(user, (tx) => tx.query<T>(sql, p));

beforeAll(async () => {
  db = await freshDb();
});
afterAll(() => db.close());
beforeEach(async () => {
  user = await createUser(db, `u${crypto.randomUUID().slice(0, 8)}@example.test`);
  gmail = new FakeGmail();
  setGmailApiFactory(async () => gmail);
});

describe("email classification rules", () => {
  it("recognises the main categories", () => {
    const cases: [string, string, string][] = [
      ["Thank you for applying to Acme Payments", "We have received your application for the Business Analyst role.", "application_confirmation"],
      ["Interview invitation – Data Analyst", "We would like to invite you for an interview. Please share your availability.", "interview_invitation"],
      ["Your interview has been rescheduled", "Your interview has been rescheduled to Monday, 10 November 2026 at 3:00 PM IST.", "interview_rescheduled"],
      ["Online assessment", "Please complete the online assessment on HackerRank within 3 days.", "assessment_invitation"],
      ["Update on your application", "Unfortunately, we have decided to move forward with other candidates.", "rejection"],
      ["Offer letter", "We are pleased to extend an offer for the role. Your offer letter is attached.", "offer"],
      ["25 new jobs for you", "Job alert: Business Analyst jobs matching your profile. Unsubscribe.", "not_job_related"],
    ];
    for (const [subject, text, expected] of cases) {
      const c = classifyEmail(mail({ subject, text, from: "Acme Careers <careers@acmepay.example>" }));
      expect(c.category, subject).toBe(expected);
    }
  });

  it("extracts company, title and job id", () => {
    const c = classifyEmail(
      mail({ subject: "Thank you for applying to Acme Payments", text: "Your application for the Payments Operations Analyst position has been received. Job ID: REQ-4411.", from: "Acme Payments Careers <no-reply@acmepay.example>" }),
    );
    expect(c.company).toBe("Acme Payments");
    expect(c.jobTitle).toMatch(/Payments Operations Analyst/);
    expect(c.jobId).toBe("REQ-4411");
  });
});

describe("Gmail automation pipeline", () => {
  it("creates an application from a confirmation and keeps timestamps separate", async () => {
    const m = mail({ subject: "Thank you for applying to Acme Payments", text: "Your application for the Payments Operations Analyst position has been received. Job ID: REQ-1.", from: "Acme Payments <no-reply@acmepay.example>" });
    const r = await processGmailMessage(db, user, m);
    expect(r.outcome).toBe("created");
    const [app] = await q("select * from applications");
    expect(app.company).toBe("Acme Payments");
    expect(app.status).toBe("applied");
    expect(app.applied_at).toBeNull(); // submission time is unknown, never inferred
    expect(new Date(app.confirmation_received_at).getTime()).toBe(m.internalDate.getTime());
    const events = await q("select type from application_events where application_id = $1", [app.id]);
    expect(events.map((e) => e.type)).toContain("confirmation_received");
  });

  it("ignores duplicates and newsletters", async () => {
    const m = mail({ subject: "Thank you for applying to Beta Bank", text: "Your application for the Data Analyst role has been received.", from: "Beta Bank <jobs@betabank.example>" });
    expect((await processGmailMessage(db, user, m)).outcome).toBe("created");
    expect((await processGmailMessage(db, user, m)).outcome).toBe("duplicate");
    const alert = mail({ subject: "30 new jobs for you", text: "Job alert: jobs matching your profile.", from: "Jobs <alerts@portal.example>" });
    expect((await processGmailMessage(db, user, alert)).outcome).toBe("ignored");
    const stored = await q("select subject, from_email from processed_messages where gmail_message_id = $1", [alert.id]);
    expect(stored[0].subject).toBeNull(); // nothing kept for unrelated email
    expect(await q("select * from applications")).toHaveLength(1);
  });

  it("matches a recruiter reply on the same thread and records an interview", async () => {
    const conf = mail({ subject: "Thank you for applying to Gamma Fintech", text: "Your application for the Business Operations Associate role has been received.", from: "Gamma Fintech <careers@gammafin.example>", threadId: "t-gamma" });
    await processGmailMessage(db, user, conf);
    const inv = mail({
      subject: "Interview invitation – Business Operations Associate",
      text: "Hi, we would like to invite you for an interview on 12 November 2026 at 11:00 AM IST. Join at https://meet.google.com/abc-defg-hij",
      from: "Priya Sharma <priya.sharma@gammafin.example>",
      threadId: "t-gamma",
    });
    const r = await processGmailMessage(db, user, inv);
    expect(r.outcome).toBe("linked");
    const [app] = await q("select * from applications");
    expect(app.status).toBe("interview_scheduled");
    const [iv] = await q("select * from interviews");
    expect(iv.location_or_link).toContain("meet.google.com");
    expect(iv.scheduled_at).not.toBeNull();
    const rec = await q("select * from recruiter_contacts");
    expect(rec[0].email).toBe("priya.sharma@gammafin.example");

    const resched = mail({ subject: "Your interview has been rescheduled", text: "Your interview has been rescheduled to 14 November 2026 at 4:00 PM IST.", from: "Priya Sharma <priya.sharma@gammafin.example>", threadId: "t-gamma" });
    expect((await processGmailMessage(db, user, resched)).outcome).toBe("linked");
    const ivs = await q("select * from interviews");
    expect(ivs).toHaveLength(1);
    expect(ivs[0].status).toBe("rescheduled");
  });

  it("does not guess between two applications at the same company", async () => {
    await db.withUser(user, async (tx) => {
      await createApplication(tx, user, { company: "Delta Corp", roleTitle: "Data Analyst", status: "applied" });
      await createApplication(tx, user, { company: "Delta Corp", roleTitle: "Business Analyst", status: "applied" });
    });
    const vague = mail({ subject: "Your application at Delta Corp", text: "We are currently reviewing your application and will get back to you.", from: "Delta Corp Talent <talent@deltacorp.example>" });
    expect((await processGmailMessage(db, user, vague)).outcome).toBe("review");
    const specific = mail({ subject: "Online assessment – Data Analyst", text: "For the Data Analyst role at Delta Corp, please complete the online assessment on HackerRank: https://hackerrank.com/test/xyz", from: "Delta Corp Talent <talent@deltacorp.example>" });
    const r = await processGmailMessage(db, user, specific);
    expect(r.outcome).toBe("linked");
    const apps = await q("select role_title, status from applications order by role_title");
    expect(apps.find((a) => a.role_title === "Data Analyst").status).toBe("assessment_pending");
    expect(apps.find((a) => a.role_title === "Business Analyst").status).toBe("applied");
    expect(await q("select * from assessments")).toHaveLength(1);
  });

  it("never applies an ambiguous rejection automatically", async () => {
    const { application } = await db.withUser(user, (tx) => createApplication(tx, user, { company: "Epsilon Pay", roleTitle: "Payments Analyst", status: "applied" }));
    const weak = mail({ subject: "Epsilon Pay update", text: "Unfortunately the team is busy this week. We will keep your resume on file.", from: "Epsilon Pay <hr@epsilonpay.example>" });
    await processGmailMessage(db, user, weak);
    const [app] = await q("select status from applications where id = $1", [application.id]);
    expect(app.status).toBe("applied");
    expect((await q("select * from review_queue where status = 'open'")).length).toBeGreaterThan(0);
  });

  it("respects manual decisions and routes conflicting emails to review", async () => {
    const { application } = await db.withUser(user, (tx) => createApplication(tx, user, { company: "Zeta Bank", roleTitle: "Operations Analyst", status: "applied" }));
    await db.withUser(user, (tx) => setStatusManually(tx, user, application.id, "hr_round"));
    const rej = mail({
      subject: "Your application for Operations Analyst at Zeta Bank",
      text: "Thank you for your interest in the Operations Analyst role at Zeta Bank. We regret to inform you that we will not be moving forward with your application.",
      from: "Zeta Bank Careers <careers@zetabank.example>",
    });
    await processGmailMessage(db, user, rej);
    const [app] = await q("select status, status_locked from applications where id = $1", [application.id]);
    expect(app.status).toBe("hr_round");
    expect(app.status_locked).toBe(true);
    const [item] = await q("select * from review_queue where application_id = $1 and kind = 'status_change'", [application.id]);
    expect(item.suggestion.to).toBe("rejected");
    // User confirms the review item: now it applies, with history
    await db.withUser(user, (tx) => resolveReview(tx, user, item.id, { decision: "accept" }));
    const [after] = await q("select status from applications where id = $1", [application.id]);
    expect(after.status).toBe("rejected");
    const hist = await q("select from_status, to_status, source from status_history where application_id = $1 order by created_at", [application.id]);
    expect(hist.map((h) => h.to_status)).toEqual(["applied", "hr_round", "rejected"]);
  });

  it("detects offers on matched applications", async () => {
    const conf = mail({ subject: "Thank you for applying to Theta Tech", text: "Your application for the Product Operations Analyst role has been received.", from: "Theta Tech <jobs@thetatech.example>", threadId: "t-theta" });
    await processGmailMessage(db, user, conf);
    const offer = mail({ subject: "Offer letter – Product Operations Analyst", text: "We are pleased to extend an offer of employment. CTC: 8,00,000 per annum. Your offer letter is attached.", from: "Theta Tech HR <hr@thetatech.example>", threadId: "t-theta" });
    expect((await processGmailMessage(db, user, offer)).outcome).toBe("linked");
    const [app] = await q("select status from applications");
    expect(app.status).toBe("offer_received");
    expect((await q("select * from notifications where type = 'offer_received'")).length).toBe(1);
  });

  it("imports history in pages through the job queue and then syncs new mail", async () => {
    gmail.add(
      mail({ subject: "Thank you for applying to Iota Labs", text: "Your application for the Data Analyst role has been received.", from: "Iota Labs <jobs@iotalabs.example>" }),
      mail({ subject: "Thank you for applying to Kappa Finance", text: "Your application for the Business Analyst role has been received.", from: "Kappa Finance <jobs@kappafin.example>" }),
      mail({ subject: "Job alert: 12 new jobs", text: "Jobs matching your profile. Unsubscribe", from: "alerts@portal.example" }),
    );
    gmail.pending = [];
    await startHistoricalImport(db, user, { start: new Date(Date.now() - 30 * 864e5) });
    const handlers = { "gmail.import": async (_db: Database, job: any) => void (await runImportPage(db, job.user_id)) };
    for (let i = 0; i < 5; i++) await runDueJobs(db, handlers, { workerId: "test" });
    const st: any = await db.asService((tx) => tx.one("select * from gmail_sync_state where user_id = $1", [user]));
    expect(st.import_status).toBe("completed");
    expect(st.import_counts.scanned).toBe(3);
    expect(st.history_id).not.toBeNull();
    expect(await q("select * from applications")).toHaveLength(2);

    gmail.add(mail({ subject: "Thank you for applying to Lambda Pay", text: "Your application for the Payments Operations role has been received.", from: "Lambda Pay <jobs@lambdapay.example>" }));
    const r = await incrementalSync(db, user);
    expect(r.mode).toBe("history");
    expect(await q("select * from applications")).toHaveLength(3);
  });

  it("recovers when the history checkpoint expires", async () => {
    await db.asService((tx) => tx.query("insert into gmail_sync_state (user_id, history_id, last_synced_at) values ($1,'5',now() - interval '10 days')", [user]));
    gmail.historyExpired = true;
    gmail.add(mail({ subject: "Thank you for applying to Mu Systems", text: "Your application for the Operations Analyst role has been received.", from: "Mu Systems <jobs@musys.example>" }));
    const r = await incrementalSync(db, user);
    expect(r.mode).toBe("poll");
    expect(await q("select * from applications")).toHaveLength(1);
    const st: any = await db.asService((tx) => tx.one("select history_id, consecutive_failures from gmail_sync_state where user_id = $1", [user]));
    expect(Number(st.history_id)).toBe(gmail.historyId);
  });
});

describe("tokens, authorisation and disconnection", () => {
  it("encrypts tokens and signs OAuth state", () => {
    const c = encryptSecret("refresh-token-value");
    expect(c).not.toContain("refresh-token-value");
    expect(decryptSecret(c)).toBe("refresh-token-value");
    const s = signState({ uid: "abc" }, "secret");
    expect(verifyState(s, "secret")?.uid).toBe("abc");
    expect(verifyState(s, "wrong")).toBeNull();
    expect(verifyState(s.replace(/.$/, "x"), "secret")).toBeNull();
  });

  it("marks the connection expired and notifies when Google rejects the refresh token", async () => {
    setGmailApiFactory(null);
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    await saveGmailConnection(db, user, { googleEmail: "candidate@example.test", refreshToken: "r", accessToken: "a", expiresAt: new Date(Date.now() - 1000), scopes: [] });
    await db.asService((tx) => tx.query("update gmail_sync_state set history_id = '10' where user_id = $1", [user]));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(incrementalSync(db, user)).rejects.toBeInstanceOf(GmailAuthError);
    fetchMock.mockRestore();
    const conn = await db.withUser(user, (tx) => tx.one("select status from gmail_connections"));
    expect(conn?.status).toBe("expired");
    expect((await q("select * from notifications where type = 'authorization_expired'")).length).toBe(1);
  });

  it("disconnects and removes tokens and queued work", async () => {
    await saveGmailConnection(db, user, { googleEmail: "candidate@example.test", refreshToken: "r", accessToken: "a", expiresAt: new Date(Date.now() + 3600_000), scopes: [] });
    await db.asService((tx) => enqueueJob(tx, { userId: user, type: "gmail.sync", dedupeKey: `gmail.sync:${user}` }));
    setGmailApiFactory(async () => gmail);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const r = await disconnectGmail(db, user, { deleteImportedData: true });
    fetchMock.mockRestore();
    expect(r.revoked).toBe(true);
    expect(gmail.stopped).toBe(true);
    expect(await db.asService((tx) => tx.query("select * from gmail_connections where user_id = $1", [user]))).toHaveLength(0);
    expect(await db.asService((tx) => tx.query("select * from automation_jobs where user_id = $1 and status = 'queued'", [user]))).toHaveLength(0);
  });
});

describe("background job retries", () => {
  it("retries with backoff and marks jobs dead after max attempts", async () => {
    await db.asService((tx) => enqueueJob(tx, { userId: user, type: "flaky", maxAttempts: 2 }));
    let calls = 0;
    const handlers = { flaky: async () => void (calls++, (() => { throw new Error("boom"); })()) };
    await runDueJobs(db, handlers, { workerId: "t" });
    let job: any = await db.asService((tx) => tx.one("select * from automation_jobs where user_id = $1 and type = 'flaky'", [user]));
    expect(job.status).toBe("queued");
    expect(new Date(job.run_after).getTime()).toBeGreaterThan(Date.now());
    await runDueJobs(db, handlers, { workerId: "t", now: new Date(Date.now() + 3600_000) });
    job = await db.asService((tx) => tx.one("select * from automation_jobs where user_id = $1 and type = 'flaky'", [user]));
    expect(job.status).toBe("dead");
    expect(calls).toBe(2);
    const errs = await db.asService((tx) => tx.query("select * from automation_errors where job_id = $1", [job.id]));
    expect(errs).toHaveLength(2);
  });
});
