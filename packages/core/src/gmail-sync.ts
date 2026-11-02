import {
  classifyEmail,
  createGmailApi,
  decryptSecret,
  encryptSecret,
  GmailHttpError,
  jobSearchQuery,
  refreshAccessToken,
  revokeToken,
  type GmailApi,
  type GmailMessage,
} from "@careerflow/gmail";
import { untrusted } from "@careerflow/ai";
import {
  emailClassificationSchema,
  emailDomain,
  rootDomain,
  truncate,
  type ApplicationStatus,
  type EmailCategory,
  type EmailClassification,
  type EventType,
} from "@careerflow/shared";
import type { Database, Tx } from "@careerflow/database";
import { aiFor } from "./ai";
import { changeStatus, enqueueJob, notify, recordEvent } from "./automation";
import { decideMatch, scoreMatches, type MatchCandidateApp } from "./matching";

// ---------------------------------------------------------------------------
// Gmail API access with token refresh
// ---------------------------------------------------------------------------
let apiFactory: ((db: Database, userId: string) => Promise<GmailApi>) | null = null;
/** Tests inject a fake Gmail API here. */
export function setGmailApiFactory(f: typeof apiFactory) {
  apiFactory = f;
}

export class GmailAuthError extends Error {}

export async function gmailApiFor(db: Database, userId: string): Promise<GmailApi> {
  if (apiFactory) return apiFactory(db, userId);
  const conn = await db.asService((tx) => tx.one("select * from gmail_connections where user_id = $1", [userId]));
  if (!conn || conn.status === "revoked") throw new GmailAuthError("Gmail is not connected.");
  if (!conn.encrypted_refresh_token) throw new GmailAuthError("Gmail connection has no refresh token. Please reconnect.");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured on the server.");
  let cached: { token: string; exp: number } | null =
    conn.encrypted_access_token && conn.access_token_expires_at ? { token: decryptSecret(conn.encrypted_access_token), exp: new Date(conn.access_token_expires_at).getTime() } : null;
  return createGmailApi(async () => {
    if (cached && cached.exp - 60_000 > Date.now()) return cached.token;
    try {
      const t = await refreshAccessToken({ clientId, clientSecret }, decryptSecret(conn.encrypted_refresh_token));
      cached = { token: t.accessToken, exp: t.expiresAt.getTime() };
      await db.asService((tx) =>
        tx.query("update gmail_connections set encrypted_access_token = $2, access_token_expires_at = $3, status = 'active', last_error = null where user_id = $1", [
          userId,
          encryptSecret(t.accessToken),
          t.expiresAt.toISOString(),
        ]),
      );
      return t.accessToken;
    } catch (e: any) {
      if (e?.code === "invalid_grant") {
        await db.asService(async (tx) => {
          await tx.query("update gmail_connections set status = 'expired', last_error = 'Google access was revoked or expired' where user_id = $1", [userId]);
          await notify(tx, userId, {
            type: "authorization_expired",
            title: "Reconnect Gmail",
            body: "Google access for CareerFlow expired or was revoked. Reconnect Gmail to keep tracking applications.",
            link: "/app/settings#gmail",
            dedupeKey: `auth-expired:${new Date().toISOString().slice(0, 10)}`,
          });
        });
        throw new GmailAuthError("Google authorization expired. Please reconnect Gmail.");
      }
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// Classification (rules first, AI refinement only when helpful and allowed)
// ---------------------------------------------------------------------------
async function classify(db: Database, userId: string, m: GmailMessage): Promise<{ c: EmailClassification; method: "rules" | "rules+ai" }> {
  const rules = classifyEmail(m);
  const consent = await db.asService((tx) => tx.one<{ ai_processing_consent: boolean }>("select ai_processing_consent from user_preferences where user_id = $1", [userId]));
  const ai = consent?.ai_processing_consent ? aiFor(db, userId) : null;
  const uncertain = rules.category !== "not_job_related" ? rules.confidence < 0.8 || !rules.company : rules.confidence < 0.7 && /job|application|interview|recruit/i.test(m.subject);
  if (!ai || !uncertain) return { c: rules, method: "rules" };
  try {
    // Data minimisation: only sender, subject, date and the first 3,000 characters are sent
    const { data } = await ai.generateJson({
      feature: "gmail.classify",
      userId,
      schema: emailClassificationSchema,
      system: "Classify a single email for a job seeker's application tracker. Extract only what is explicitly written in the email. Use null when unknown. Confidence reflects how clearly the email states its purpose.",
      prompt: untrusted(
        "email",
        `From: ${m.from}\nDate: ${m.internalDate.toISOString()}\nSubject: ${m.subject}\n\n${m.text.slice(0, 3000)}`,
      ),
      temperature: 0,
    });
    // Rules stay the guard rail for newsletters and job alerts
    if (rules.category === "not_job_related" && rules.confidence >= 0.9) return { c: rules, method: "rules" };
    return { c: { ...data, links: data.links.length ? data.links : rules.links }, method: "rules+ai" };
  } catch {
    return { c: rules, method: "rules" };
  }
}

const CATEGORY_STATUS: Partial<Record<EmailCategory, ApplicationStatus>> = {
  application_confirmation: "applied",
  recruiter_acknowledgement: "under_review",
  recruiter_outreach: "recruiter_contacted",
  assessment_invitation: "assessment_pending",
  interview_invitation: "interview_scheduling",
  interview_rescheduled: "interview_scheduled",
  rejection: "rejected",
  offer: "offer_received",
};

const CATEGORY_EVENT: Partial<Record<EmailCategory, EventType>> = {
  application_confirmation: "confirmation_received",
  recruiter_acknowledgement: "recruiter_reply",
  recruiter_outreach: "recruiter_reply",
  assessment_invitation: "assessment_assigned",
  interview_invitation: "interview_requested",
  interview_rescheduled: "interview_rescheduled",
  rejection: "rejection_received",
  offer: "offer_received",
};

function parseLooseDate(s: string | null): string | null {
  if (!s) return null;
  const cleaned = s.replace(/(\d)(st|nd|rd|th)/gi, "$1").replace(/\b(ist)\b/i, "+0530").replace(/\bat\b/i, " ");
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type ProcessOutcome = "linked" | "created" | "review" | "ignored" | "duplicate" | "error";

/** Processes one Gmail message end to end. Idempotent: a message is processed once per user. */
export async function processGmailMessage(db: Database, userId: string, m: GmailMessage): Promise<{ outcome: ProcessOutcome; applicationId?: string; category?: string }> {
  const seen = await db.asService((tx) => tx.one("select id from processed_messages where user_id = $1 and gmail_message_id = $2", [userId, m.id]));
  if (seen) return { outcome: "duplicate" };

  const { c, method } = await classify(db, userId, m);
  if (c.category === "not_job_related") {
    // Store only the id so it is not processed again. No subject, sender or content is kept.
    await db.asService((tx) =>
      tx.query("insert into processed_messages (user_id, gmail_message_id, outcome) values ($1,$2,'ignored') on conflict do nothing", [userId, m.id]),
    );
    return { outcome: "ignored", category: c.category };
  }

  return db.asService(async (tx) => {
    const pm = await tx.one<{ id: string }>(
      `insert into processed_messages (user_id, gmail_message_id, thread_id, internal_date, from_email, from_name, subject, snippet, outcome)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'review') on conflict (user_id, gmail_message_id) do nothing returning id`,
      [userId, m.id, m.threadId, m.internalDate.toISOString(), m.fromEmail, m.fromName, truncate(m.subject, 300), truncate(m.snippet, 300)],
    );
    if (!pm) return { outcome: "duplicate" as const };
    const extracted = { ...c, category: undefined, confidence: undefined };
    await tx.query("insert into email_classifications (user_id, processed_message_id, category, confidence, extracted, method) values ($1,$2,$3,$4,$5::jsonb,$6)", [
      userId,
      pm.id,
      c.category,
      c.confidence,
      JSON.stringify(extracted),
      method,
    ]);

    const apps = await tx.query<MatchCandidateApp>(
      `select a.id, a.company, a.company_domain, a.role_title, a.external_job_id, a.external_application_id, a.gmail_thread_ids, a.created_at, a.status,
              r.email as recruiter_email
       from applications a left join recruiter_contacts r on r.id = a.recruiter_id where a.user_id = $1 and not a.archived`,
      [userId],
    );
    const decision = decideMatch(scoreMatches(apps, c, { threadId: m.threadId, fromEmail: m.fromEmail, date: m.internalDate }));
    const setOutcome = (o: ProcessOutcome) => tx.query("update processed_messages set outcome = $2 where id = $1", [pm.id, o]);

    if (decision.kind === "high") {
      const appId = decision.best.applicationId;
      await applyEmailToApplication(tx, userId, appId, pm.id, m, c, decision.best.score, decision.best.reasons);
      await setOutcome("linked");
      return { outcome: "linked" as const, applicationId: appId, category: c.category };
    }

    // New application detected from a clear confirmation email with company and role
    if (decision.kind === "low" && c.category === "application_confirmation" && c.company && c.jobTitle && c.confidence >= 0.8) {
      const domain = rootDomain(emailDomain(m.fromEmail));
      const app = await tx.one<{ id: string }>(
        `insert into applications (user_id, company, company_domain, role_title, status, status_source, job_portal, external_job_id, external_application_id,
           confirmation_received_at, gmail_thread_ids, dedupe_key)
         values ($1,$2,$3,$4,'applied','gmail',$5,$6,$7,$8,$9::text[],null) returning id`,
        [userId, c.company, c.source ? null : domain, c.jobTitle, c.source, c.jobId, c.applicationId, m.internalDate.toISOString(), [m.threadId]],
      );
      await tx.query("insert into status_history (user_id, application_id, from_status, to_status, source, reason, confidence, evidence_message_id) values ($1,$2,null,'applied','gmail','Detected from confirmation email',$3,$4)", [
        userId,
        app!.id,
        c.confidence,
        pm.id,
      ]);
      await tx.query("insert into application_email_links (user_id, application_id, processed_message_id, match_confidence, match_reasons) values ($1,$2,$3,$4,$5::jsonb)", [
        userId,
        app!.id,
        pm.id,
        c.confidence,
        JSON.stringify(["Created from this confirmation email"]),
      ]);
      await recordEvent(tx, userId, { applicationId: app!.id, type: "confirmation_received", source: "gmail", occurredAt: m.internalDate, payload: { subject: truncate(m.subject, 200) }, dedupeKey: `gmail:${m.id}:confirmation_received` });
      await upsertRecruiter(tx, userId, app!.id, c);
      await notify(tx, userId, { type: "application_detected", title: `New application tracked: ${c.company}`, body: `${c.jobTitle} — detected from a confirmation email.`, link: `/app/applications/${app!.id}`, dedupeKey: `detected:${m.id}` });
      await setOutcome("created");
      return { outcome: "created" as const, applicationId: app!.id, category: c.category };
    }

    // Medium confidence or unclear: ask the user
    await tx.query(
      `insert into review_queue (user_id, kind, processed_message_id, application_id, suggestion, confidence) values ($1,$2,$3,$4,$5::jsonb,$6)`,
      [
        userId,
        decision.kind === "low" && c.category === "application_confirmation" ? "new_application" : "email_match",
        pm.id,
        decision.kind === "medium" ? decision.candidates[0].applicationId : null,
        JSON.stringify({ category: c.category, company: c.company, jobTitle: c.jobTitle, candidates: decision.candidates, suggestedStatus: CATEGORY_STATUS[c.category] ?? null }),
        decision.kind === "medium" ? decision.candidates[0].score : c.confidence,
      ],
    );
    await notify(tx, userId, {
      type: "review_needed",
      title: `Check an email${c.company ? ` from ${c.company}` : ""}`,
      body: `"${truncate(m.subject, 90)}" may relate to one of your applications. Please confirm.`,
      link: "/app/review",
      dedupeKey: `review-email:${m.id}`,
    });
    return { outcome: "review" as const, category: c.category };
  });
}

async function upsertRecruiter(tx: Tx, userId: string, applicationId: string, c: EmailClassification) {
  if (!c.recruiterEmail || /no-?reply|notification|jobs@|careers@|talent@|hr@/i.test(c.recruiterEmail)) return;
  const r = await tx.one<{ id: string }>(
    `insert into recruiter_contacts (user_id, name, company, email, source, last_contacted_at) values ($1,$2,$3,$4,'gmail',now())
     on conflict (user_id, lower(email)) where email is not null do update set last_contacted_at = now(), name = coalesce(recruiter_contacts.name, excluded.name)
     returning id`,
    [userId, c.recruiterName, c.company, c.recruiterEmail],
  );
  if (r) await tx.query("update applications set recruiter_id = coalesce(recruiter_id, $2) where id = $1", [applicationId, r.id]);
}

/** Links an email to an application and applies the safe status change and side records. */
export async function applyEmailToApplication(
  tx: Tx,
  userId: string,
  appId: string,
  processedMessageId: string,
  m: Pick<GmailMessage, "id" | "threadId" | "internalDate" | "subject">,
  c: EmailClassification,
  confidence: number,
  reasons: string[],
  confirmedByUser = false,
) {
  await tx.query(
    `insert into application_email_links (user_id, application_id, processed_message_id, match_confidence, match_reasons, confirmed_by_user) values ($1,$2,$3,$4,$5::jsonb,$6)
     on conflict (application_id, processed_message_id) do update set confirmed_by_user = excluded.confirmed_by_user`,
    [userId, appId, processedMessageId, confidence, JSON.stringify(reasons), confirmedByUser],
  );
  await tx.query("update applications set gmail_thread_ids = (select array_agg(distinct t) from unnest(array_append(gmail_thread_ids, $2::text)) t) where id = $1", [appId, m.threadId]);
  if (c.category === "application_confirmation")
    await tx.query("update applications set confirmation_received_at = coalesce(confirmation_received_at, $2::timestamptz) where id = $1", [appId, m.internalDate.toISOString()]);
  if (c.jobId) await tx.query("update applications set external_job_id = coalesce(external_job_id, $2) where id = $1", [appId, c.jobId]);
  if (c.applicationId) await tx.query("update applications set external_application_id = coalesce(external_application_id, $2) where id = $1", [appId, c.applicationId]);

  const evType = CATEGORY_EVENT[c.category];
  if (evType)
    await recordEvent(tx, userId, { applicationId: appId, type: evType, source: "gmail", occurredAt: m.internalDate, payload: { subject: truncate(m.subject, 200), messageId: processedMessageId }, dedupeKey: `gmail:${m.id}:${evType}` });

  // Status: overall confidence is the weaker of classification and match
  let target = CATEGORY_STATUS[c.category];
  const dt = parseLooseDate(c.interviewDateTime);
  if (c.category === "interview_invitation" && dt) target = "interview_scheduled";
  if (target) {
    const conf = confirmedByUser ? 1 : Math.min(c.confidence, confidence);
    await changeStatus(tx, userId, appId, target, { source: "gmail", reason: `Email: ${truncate(m.subject, 120)}`, confidence: conf, evidenceMessageId: processedMessageId, occurredAt: m.internalDate });
  }

  const app = await tx.one<{ company: string; role_title: string }>("select company, role_title from applications where id = $1", [appId]);
  const label = `${app?.company}: ${app?.role_title}`;
  if (c.category === "interview_invitation" || c.category === "interview_rescheduled") {
    const existing = await tx.one<{ id: string }>("select id from interviews where application_id = $1 and status in ('requested','scheduled','rescheduled') order by created_at desc limit 1", [appId]);
    if (existing && c.category === "interview_rescheduled")
      await tx.query("update interviews set scheduled_at = coalesce($2::timestamptz, scheduled_at), status = 'rescheduled', location_or_link = coalesce($3, location_or_link) where id = $1", [existing.id, dt, c.interviewLink]);
    else if (!existing)
      await tx.query("insert into interviews (user_id, application_id, scheduled_at, mode, location_or_link, status, source, notes) values ($1,$2,$3::timestamptz,$4,$5,$6,'gmail',$7)", [
        userId,
        appId,
        dt,
        c.interviewMode ?? "unknown",
        c.interviewLink,
        dt ? "scheduled" : "requested",
        dt ? null : `Date not found automatically. Email said: ${c.interviewDateTime ?? "see email"}`,
      ]);
    await notify(tx, userId, {
      type: c.category === "interview_rescheduled" ? "interview_rescheduled" : "interview_invitation",
      title: c.category === "interview_rescheduled" ? `Interview rescheduled — ${app?.company}` : `Interview invitation — ${app?.company}`,
      body: label + (c.interviewDateTime ? ` · ${c.interviewDateTime}` : ""),
      link: `/app/applications/${appId}`,
      dedupeKey: `interview:${m.id}`,
    });
  } else if (c.category === "assessment_invitation") {
    await tx.query("insert into assessments (user_id, application_id, title, link, status, source) values ($1,$2,$3,$4,'pending','gmail')", [userId, appId, truncate(m.subject, 200), c.assessmentLink]);
    await notify(tx, userId, { type: "assessment_received", title: `Assessment received — ${app?.company}`, body: c.assessmentDeadline ?? label, link: `/app/applications/${appId}`, dedupeKey: `assessment:${m.id}` });
  } else if (c.category === "offer") {
    await notify(tx, userId, { type: "offer_received", title: `Offer email — ${app?.company}`, body: "Review it in the Offer workspace.", link: `/app/offers`, dedupeKey: `offer:${m.id}` });
  } else if (c.category === "rejection") {
    await notify(tx, userId, { type: "status_update", title: `Update from ${app?.company}`, body: `${label}: the company is not moving forward.`, link: `/app/applications/${appId}`, dedupeKey: `status:${m.id}` });
  } else if (c.category === "recruiter_acknowledgement" || c.category === "recruiter_outreach") {
    await notify(tx, userId, { type: "recruiter_reply", title: `Recruiter message — ${app?.company}`, body: truncate(m.subject, 120), link: `/app/applications/${appId}`, dedupeKey: `reply:${m.id}` });
  }
  await upsertRecruiter(tx, userId, appId, c);
}

/** Resolves a review item. accept + applicationId links the email; accept + create makes a new application. */
export async function resolveReview(tx: Tx, userId: string, reviewId: string, action: { decision: "accept" | "reject" | "dismiss"; applicationId?: string; createNew?: { company: string; roleTitle: string } }) {
  const item = await tx.one("select * from review_queue where id = $1 and status = 'open'", [reviewId]);
  if (!item) throw new Error("Review item not found or already resolved");
  if (action.decision === "accept") {
    if (item.kind === "status_change") {
      await changeStatus(tx, userId, item.application_id, item.suggestion.to, { source: "manual", reason: "Confirmed from review", evidenceMessageId: item.processed_message_id });
    } else if (item.processed_message_id) {
      const pm = await tx.one("select * from processed_messages where id = $1", [item.processed_message_id]);
      if (!pm) throw new Error("Email no longer available");
      const cl = await tx.one("select * from email_classifications where processed_message_id = $1 order by created_at desc limit 1", [item.processed_message_id]);
      const c: EmailClassification = { ...(cl?.extracted ?? {}), category: cl?.category ?? "recruiter_acknowledgement", confidence: Number(cl?.confidence ?? 0.5), links: cl?.extracted?.links ?? [] };
      let appId = action.applicationId ?? item.application_id;
      if (action.createNew) {
        const created = await tx.one<{ id: string }>(
          `insert into applications (user_id, company, role_title, status, status_source, confirmation_received_at, gmail_thread_ids)
           values ($1,$2,$3,'applied','gmail',$4,$5::text[]) returning id`,
          [userId, action.createNew.company, action.createNew.roleTitle, c.category === "application_confirmation" ? pm.internal_date : null, [pm.thread_id]],
        );
        appId = created!.id;
        await tx.query("insert into status_history (user_id, application_id, from_status, to_status, source, reason) values ($1,$2,null,'applied','manual','Created from a reviewed email')", [userId, appId]);
      }
      if (!appId) throw new Error("Choose an application to link this email to");
      await applyEmailToApplication(tx, userId, appId, pm.id, { id: pm.gmail_message_id, threadId: pm.thread_id, internalDate: new Date(pm.internal_date), subject: pm.subject ?? "" }, c, 1, ["Confirmed by you"], true);
      await tx.query("update processed_messages set outcome = 'linked' where id = $1", [pm.id]);
    }
  }
  await tx.query("update review_queue set status = $2, resolved_at = now() where id = $1", [reviewId, action.decision === "accept" ? "accepted" : action.decision === "reject" ? "rejected" : "dismissed"]);
}

// ---------------------------------------------------------------------------
// Import, incremental sync, push watch, disconnect
// ---------------------------------------------------------------------------
export async function startHistoricalImport(db: Database, userId: string, range: { start: Date; end?: Date }) {
  await db.asService(async (tx) => {
    await tx.query(
      `insert into gmail_sync_state (user_id, import_status, import_range_start, import_range_end, import_page_token, import_counts)
       values ($1,'queued',$2,$3,null,'{}'::jsonb)
       on conflict (user_id) do update set import_status = 'queued', import_range_start = $2, import_range_end = $3, import_page_token = null, import_counts = '{}'::jsonb, last_error = null`,
      [userId, range.start.toISOString(), range.end?.toISOString() ?? null],
    );
    await enqueueJob(tx, { userId, type: "gmail.import", payload: {}, dedupeKey: `gmail.import:${userId}` });
  });
}

/** Processes one page (up to 100 messages) of the historical import, then queues the next page. */
export const IMPORT_PAGE_SIZE = Number(process.env.GMAIL_IMPORT_PAGE_SIZE ?? 25);
const IMPORT_PAUSE_MS = Number(process.env.GMAIL_IMPORT_PAUSE_MS ?? 120);

export async function runImportPage(db: Database, userId: string) {
  const st = await db.asService((tx) => tx.one("select * from gmail_sync_state where user_id = $1", [userId]));
  if (!st || !["queued", "running"].includes(st.import_status)) return { done: true };
  await db.asService((tx) => tx.query("update gmail_sync_state set import_status = 'running' where user_id = $1", [userId]));
  const api = await gmailApiFor(db, userId);
  const q = jobSearchQuery(new Date(st.import_range_start), st.import_range_end ? new Date(st.import_range_end) : undefined);
  // Small pages with a short pause keep each run under serverless time limits and Gmail per-user quotas
  const page = await api.listMessages(q, st.import_page_token ?? undefined, IMPORT_PAGE_SIZE);
  const counts: Record<string, number> = { ...(st.import_counts ?? {}) };
  for (const ref of page.messages) {
    const msg = await api.getMessage(ref.id);
    const r = await processGmailMessage(db, userId, msg);
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    counts.scanned = (counts.scanned ?? 0) + 1;
    await new Promise((r) => setTimeout(r, IMPORT_PAUSE_MS));
  }
  const done = !page.nextPageToken;
  await db.asService(async (tx) => {
    await tx.query("update gmail_sync_state set import_page_token = $2, import_counts = $3::jsonb, import_status = $4, last_full_sync_at = case when $4 = 'completed' then now() else last_full_sync_at end where user_id = $1", [
      userId,
      page.nextPageToken ?? null,
      JSON.stringify(counts),
      done ? "completed" : "running",
    ]);
    if (!done) await enqueueJob(tx, { userId, type: "gmail.import", dedupeKey: `gmail.import:${userId}:${page.nextPageToken}` });
  });
  if (done) {
    const st2 = await db.asService((tx) => tx.one("select history_id from gmail_sync_state where user_id = $1", [userId]));
    if (!st2?.history_id) {
      const prof = await api.getProfile();
      await db.asService((tx) => tx.query("update gmail_sync_state set history_id = $2, last_synced_at = now() where user_id = $1", [userId, prof.historyId]));
    }
  }
  return { done, counts };
}

/** Incremental sync using the Gmail history API, with a polling fallback when history is too old. */
export async function incrementalSync(db: Database, userId: string) {
  const api = await gmailApiFor(db, userId);
  let st = await db.asService((tx) => tx.one("select * from gmail_sync_state where user_id = $1", [userId]));
  if (!st) {
    await db.asService((tx) => tx.query("insert into gmail_sync_state (user_id) values ($1) on conflict do nothing", [userId]));
    st = { history_id: null, last_synced_at: null };
  }
  const outcomes: Record<string, number> = {};
  const tally = (o: string) => (outcomes[o] = (outcomes[o] ?? 0) + 1);
  try {
    if (!st.history_id) {
      const prof = await api.getProfile();
      await db.asService((tx) => tx.query("update gmail_sync_state set history_id = $2, last_synced_at = now(), consecutive_failures = 0 where user_id = $1", [userId, prof.historyId]));
      return { mode: "initialised", outcomes };
    }
    let historyId = st.history_id as string;
    let pageToken: string | undefined;
    let mode = "history";
    try {
      do {
        const h = await api.listHistory(st.history_id, pageToken);
        for (const ref of h.messageIds) tally((await processGmailMessage(db, userId, await api.getMessage(ref.id))).outcome);
        historyId = h.historyId;
        pageToken = h.nextPageToken;
      } while (pageToken);
    } catch (e) {
      if (!(e instanceof GmailHttpError && e.status === 404)) throw e;
      // History expired (older than ~1 week): poll recent job-related mail instead, then reset the checkpoint
      mode = "poll";
      const since = new Date(new Date(st.last_synced_at ?? Date.now() - 7 * 864e5).getTime() - 864e5);
      let token: string | undefined;
      do {
        const page = await api.listMessages(jobSearchQuery(since), token);
        for (const ref of page.messages) tally((await processGmailMessage(db, userId, await api.getMessage(ref.id))).outcome);
        token = page.nextPageToken;
      } while (token);
      historyId = (await api.getProfile()).historyId;
    }
    await db.asService((tx) =>
      tx.query("update gmail_sync_state set history_id = $2, last_synced_at = now(), consecutive_failures = 0, last_error = null, next_retry_at = null where user_id = $1", [userId, historyId]),
    );
    return { mode, outcomes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.asService(async (tx) => {
      const row = await tx.one<{ consecutive_failures: number }>(
        "update gmail_sync_state set consecutive_failures = consecutive_failures + 1, last_error = $2 where user_id = $1 returning consecutive_failures",
        [userId, msg.slice(0, 300)],
      );
      if ((row?.consecutive_failures ?? 0) >= 3 && !(e instanceof GmailAuthError))
        await notify(tx, userId, { type: "gmail_sync_failure", title: "Gmail sync is failing", body: "CareerFlow could not check Gmail several times. It will keep retrying.", link: "/app/settings#gmail", dedupeKey: `sync-fail:${new Date().toISOString().slice(0, 10)}` });
    });
    throw e;
  }
}

/** Starts or renews Gmail push notifications (expire after 7 days). Requires GMAIL_PUBSUB_TOPIC. */
export async function renewWatch(db: Database, userId: string) {
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) return { skipped: "GMAIL_PUBSUB_TOPIC not configured; polling fallback is used" };
  const api = await gmailApiFor(db, userId);
  const w = await api.watch(topic);
  await db.asService((tx) =>
    tx.query(
      `insert into gmail_sync_state (user_id, history_id, watch_expiration) values ($1,$2,$3)
       on conflict (user_id) do update set watch_expiration = $3, history_id = coalesce(gmail_sync_state.history_id, $2)`,
      [userId, w.historyId, w.expiration.toISOString()],
    ),
  );
  return { expiration: w.expiration };
}

/** Queues periodic work for every active connection: polling fallback sync and watch renewal. */
export async function schedulePeriodicGmailWork(db: Database, opts: { pollMinutes?: number } = {}) {
  const conns = await db.asService((tx) =>
    tx.query<{ user_id: string; last_synced_at: string | null; watch_expiration: string | null }>(
      `select c.user_id, s.last_synced_at, s.watch_expiration from gmail_connections c left join gmail_sync_state s on s.user_id = c.user_id where c.status = 'active'`,
    ),
  );
  const poll = (opts.pollMinutes ?? 30) * 60_000;
  let queued = 0;
  await db.asService(async (tx) => {
    for (const c of conns) {
      if (!c.last_synced_at || Date.now() - new Date(c.last_synced_at).getTime() >= poll)
        if (await enqueueJob(tx, { userId: c.user_id, type: "gmail.sync", dedupeKey: `gmail.sync:${c.user_id}` })) queued++;
      if (process.env.GMAIL_PUBSUB_TOPIC && (!c.watch_expiration || new Date(c.watch_expiration).getTime() - Date.now() < 2 * 864e5))
        if (await enqueueJob(tx, { userId: c.user_id, type: "gmail.renew_watch", dedupeKey: `gmail.watch:${c.user_id}` })) queued++;
    }
  });
  return queued;
}

/** Disconnects Gmail: revokes the token at Google, stops push, deletes stored tokens. Optionally deletes imported email metadata. */
export async function disconnectGmail(db: Database, userId: string, opts: { deleteImportedData?: boolean } = {}) {
  const conn = await db.asService((tx) => tx.one("select encrypted_refresh_token from gmail_connections where user_id = $1", [userId]));
  let revoked = false;
  if (conn?.encrypted_refresh_token) {
    try {
      const api = await gmailApiFor(db, userId);
      await api.stop().catch(() => {});
    } catch {
      /* already invalid */
    }
    try {
      revoked = await revokeToken(decryptSecret(conn.encrypted_refresh_token));
    } catch {
      revoked = false;
    }
  }
  await db.asService(async (tx) => {
    await tx.query("delete from gmail_connections where user_id = $1", [userId]);
    await tx.query("delete from gmail_sync_state where user_id = $1", [userId]);
    await tx.query("delete from automation_jobs where user_id = $1 and type like 'gmail.%' and status = 'queued'", [userId]);
    if (opts.deleteImportedData) await tx.query("delete from processed_messages where user_id = $1", [userId]);
  });
  return { revoked };
}

export async function saveGmailConnection(db: Database, userId: string, t: { googleEmail: string; refreshToken: string; accessToken: string; expiresAt: Date; scopes: string[] }) {
  await db.asService((tx) =>
    tx.query(
      `insert into gmail_connections (user_id, google_email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, scopes, status, connected_at, disconnected_at)
       values ($1,$2,$3,$4,$5,$6::text[],'active',now(),null)
       on conflict (user_id) do update set google_email = $2, encrypted_refresh_token = $3, encrypted_access_token = $4, access_token_expires_at = $5, scopes = $6::text[],
         status = 'active', last_error = null, connected_at = now(), disconnected_at = null`,
      [userId, t.googleEmail.toLowerCase(), encryptSecret(t.refreshToken), encryptSecret(t.accessToken), t.expiresAt.toISOString(), t.scopes],
    ),
  );
  await db.asService((tx) => tx.query("insert into gmail_sync_state (user_id) values ($1) on conflict do nothing", [userId]));
}
