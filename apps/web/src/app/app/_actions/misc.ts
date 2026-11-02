"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import {
  analyzeOfferLetter,
  deleteAccount,
  detectScam,
  disconnectGmail,
  incrementalSync,
  refreshStrategy,
  researchCompany,
  resolveReview,
  saveManualOffer,
  startHistoricalImport,
  takeHome,
} from "@careerflow/core";
import { truncate } from "@careerflow/shared";
import { act, fileFrom, num, optStr, str, type ActionState } from "@/lib/action";
import { authMode } from "@/lib/config";
import { assertRateLimit } from "@/lib/rate-limit";
import { signOutSession, userDb, withUser } from "@/lib/session";
import { deleteSupabaseUser } from "@/lib/supabase";

// Notifications ----------------------------------------------------------------
export async function markReadAction(_: ActionState, f: FormData) {
  return act(async () => {
    const id = optStr(f, "id");
    await withUser((tx) => (id ? tx.query("update notifications set read_at = now() where id = $1", [id]) : tx.query("update notifications set read_at = now() where read_at is null")));
  }, ["/app/notifications", "/app"]);
}

// Review queue -------------------------------------------------------------------
export async function resolveReviewAction(_: ActionState, f: FormData) {
  return act(async () => {
    const decision = str(f, "decision") as "accept" | "reject" | "dismiss";
    const createCompany = optStr(f, "newCompany");
    const createRole = optStr(f, "newRole");
    await withUser((tx, u) =>
      resolveReview(tx, u.id, str(f, "id"), {
        decision,
        applicationId: optStr(f, "applicationId") ?? undefined,
        createNew: decision === "accept" && createCompany && createRole ? { company: createCompany, roleTitle: createRole } : undefined,
      }),
    );
    return { message: decision === "accept" ? "Confirmed and applied." : "Dismissed." };
  }, ["/app/review", "/app/applications", "/app"]);
}

// Gmail ---------------------------------------------------------------------------
export async function gmailImportAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    const range = str(f, "range");
    const days: Record<string, number> = { "30": 30, "90": 90, "180": 182, "365": 365 };
    let start: Date;
    let end: Date | undefined;
    if (range === "custom") {
      start = new Date(str(f, "from"));
      end = optStr(f, "to") ? new Date(str(f, "to")) : undefined;
      if (isNaN(start.getTime())) throw new Error("Choose a start date.");
    } else start = new Date(Date.now() - (days[range] ?? 30) * 864e5);
    await startHistoricalImport(db, user.id, { start, end });
    return { message: "Import queued. The background worker processes it page by page; progress appears here." };
  }, ["/app/settings"]);
}

export async function gmailSyncNowAction(_: ActionState, _f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "gmail-sync", 4, 60_000);
    const r = await incrementalSync(db, user.id);
    const n = Object.entries(r.outcomes).map(([k, v]) => `${v} ${k}`).join(", ");
    return { message: r.mode === "initialised" ? "Sync checkpoint set. New emails from now on will be tracked." : `Checked Gmail (${r.mode}). ${n || "No new job emails."}` };
  }, ["/app/settings", "/app/applications", "/app/review"]);
}

export async function gmailDisconnectAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    const r = await disconnectGmail(db, user.id, { deleteImportedData: f.get("deleteData") === "on" });
    return { message: `Gmail disconnected${r.revoked ? " and access revoked at Google" : ". Also remove access at myaccount.google.com/permissions if needed"}.` };
  }, ["/app/settings"]);
}

// Settings ------------------------------------------------------------------------
export async function preferencesAction(_: ActionState, f: FormData) {
  return act(async () => {
    const types = ["new_matching_job", "application_detected", "recruiter_reply", "status_update", "assessment_received", "assessment_deadline", "interview_invitation", "interview_rescheduled", "offer_received", "follow_up_due", "gmail_sync_failure", "authorization_expired", "review_needed"];
    const prefs = Object.fromEntries(types.map((t) => [t, f.get(`n_${t}`) === "on"]));
    await withUser((tx) =>
      tx.query("update user_preferences set notification_prefs = $1::jsonb, alert_frequency = $2, ai_processing_consent = $3, transcript_consent = $4", [JSON.stringify(prefs), str(f, "alertFrequency") || "daily", f.get("aiConsent") === "on", f.get("transcriptConsent") === "on"]),
    );
    return { message: "Preferences saved." };
  }, ["/app/settings"]);
}

export async function extensionTokenAction(_: ActionState, _f: FormData) {
  return act(async () => {
    const token = `cfx_${crypto.randomBytes(24).toString("base64url")}`;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await withUser((tx) => tx.query("update user_preferences set extension_token_sha256 = $1, extension_token_created_at = now()", [hash]));
    return { message: "New extension token created. Copy it now; it will not be shown again.", data: { token } };
  }, ["/app/settings"]);
}

export async function deleteAccountAction(_: ActionState, f: FormData) {
  const r = await act(async () => {
    if (str(f, "confirm") !== "DELETE") throw new Error('Type DELETE to confirm.');
    const { user, db } = await userDb();
    await deleteAccount(db, user.id, { deleteAuthUser: async (id) => (authMode() === "supabase" ? deleteSupabaseUser(id) : undefined) });
    await signOutSession();
  });
  if (r.ok) redirect("/?deleted=1");
  return r;
}

export async function revokeExtensionTokenAction(_: ActionState, _f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update user_preferences set extension_token_sha256 = null, extension_token_created_at = null"));
    return { message: "Extension token revoked." };
  }, ["/app/settings"]);
}

// Strategy ------------------------------------------------------------------------
export async function refreshStrategyAction(_: ActionState, _f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 10, 60_000);
    const r = await refreshStrategy(db, user.id);
    return { message: `${r.recs.length} recommendation(s) updated.`, data: r.narrative };
  }, ["/app/strategy", "/app"]);
}

export async function dismissRecAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update career_recommendations set dismissed_at = now() where id = $1", [str(f, "id")]));
  }, ["/app/strategy", "/app"]);
}

// Offers --------------------------------------------------------------------------
export async function offerUploadAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "ai", 10, 60_000);
    const file = await fileFrom(f, "file");
    if (!file) throw new Error("Choose the offer letter (PDF or DOCX).");
    const company = str(f, "company");
    if (!company) throw new Error("Company is required.");
    const r = await analyzeOfferLetter(db, user.id, file, { company, roleTitle: optStr(f, "roleTitle"), applicationId: optStr(f, "applicationId") });
    return { message: r.missing.length ? `Offer saved. Not found in the letter: ${r.missing.join(", ")}.` : "Offer saved." };
  }, ["/app/offers"]);
}

export async function offerManualAction(_: ActionState, f: FormData) {
  return act(async () => {
    const lpa = (k: string) => (num(f, k) === null ? null : (num(f, k) as number) * 100000);
    await withUser((tx, u) =>
      saveManualOffer(tx, u.id, {
        company: str(f, "company"),
        roleTitle: optStr(f, "roleTitle"),
        fixedCtc: lpa("fixedLpa"),
        variablePay: lpa("variableLpa"),
        joiningBonus: lpa("joiningLpa"),
        joiningDate: optStr(f, "joiningDate"),
        noticePeriodDays: num(f, "noticePeriodDays"),
        location: optStr(f, "location"),
        applicationId: optStr(f, "applicationId"),
        benefits: str(f, "benefits").split(",").map((s) => s.trim()).filter(Boolean),
      }),
    );
    return { message: "Offer added." };
  }, ["/app/offers"]);
}

export async function offerStatusAction(_: ActionState, f: FormData) {
  return act(async () => {
    const status = str(f, "status");
    if (!["evaluating", "negotiating", "accepted", "declined", "expired"].includes(status)) throw new Error("Invalid status");
    await withUser((tx) => tx.query("update offers set status = $2, decision_notes = coalesce($3, decision_notes) where id = $1", [str(f, "id"), status, optStr(f, "notes")]));
  }, ["/app/offers"]);
}

export async function deleteOfferAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("delete from offers where id = $1", [str(f, "id")]));
  }, ["/app/offers"]);
}

export async function takeHomeAction(_: ActionState, f: FormData) {
  return act(async () => {
    const fixed = (num(f, "fixedLpa") ?? 0) * 100000;
    if (fixed <= 0) throw new Error("Enter the fixed CTC in lakhs per annum.");
    return {
      data: takeHome({
        annualFixedCtc: fixed,
        variablePay: (num(f, "variableLpa") ?? 0) * 100000,
        includeVariable: f.get("includeVariable") === "on",
        basicPercentOfFixed: num(f, "basicPct") ?? 40,
        pfMode: (str(f, "pfMode") || "capped") as any,
        employerPfInCtc: f.get("employerPfInCtc") === "on",
        gratuityInCtc: f.get("gratuityInCtc") === "on",
        professionalTaxAnnual: num(f, "pt") ?? 2400,
      }),
    };
  });
}

// Scam detector -------------------------------------------------------------------
export async function scamAction(_: ActionState, f: FormData) {
  return act(async () => {
    const text = str(f, "text");
    if (text.length < 20) throw new Error("Paste the job post or message (at least a sentence).");
    const r = detectScam({ text: text.slice(0, 20000), senderEmail: optStr(f, "sender"), claimedCompany: optStr(f, "company") });
    await withUser((tx, u) => tx.query("insert into scam_checks (user_id, input_excerpt, risk_level, signals, method) values ($1,$2,$3,$4::jsonb,'rules')", [u.id, truncate(text, 300), r.risk, JSON.stringify(r.signals)]));
    return { data: r };
  }, ["/app/scam-check"]);
}

// Companies & recruiters ------------------------------------------------------------
export async function researchAction(_: ActionState, f: FormData) {
  let id: string | null = null;
  const r = await act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "research", 10, 60_000);
    const name = str(f, "name");
    if (!name) throw new Error("Enter a company name.");
    const res = await researchCompany(db, user.id, { name: name.slice(0, 120), website: optStr(f, "website") });
    id = res.id;
  }, ["/app/companies"]);
  if (r.ok && id) redirect(`/app/companies/${id}`);
  return r;
}

export async function companyNotesAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update companies set notes = $2, website = coalesce($3, website) where id = $1", [str(f, "id"), optStr(f, "notes"), optStr(f, "website")]));
    return { message: "Saved." };
  }, ["/app/companies/[id]"]);
}

export async function recruiterAction(_: ActionState, f: FormData) {
  return act(async () => {
    const op = str(f, "op");
    await withUser(async (tx, u) => {
      if (op === "delete") return void (await tx.query("delete from recruiter_contacts where id = $1", [str(f, "id")]));
      const email = optStr(f, "email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email.");
      const vals = [optStr(f, "name"), optStr(f, "company"), email?.toLowerCase() ?? null, optStr(f, "phone"), optStr(f, "linkedinUrl"), optStr(f, "title"), optStr(f, "notes"), optStr(f, "nextFollowupAt")];
      if (op === "update") await tx.query("update recruiter_contacts set name=$2, company=$3, email=$4, phone=$5, linkedin_url=$6, title=$7, notes=$8, next_followup_at=$9::timestamptz where id=$1", [str(f, "id"), ...vals]);
      else await tx.query("insert into recruiter_contacts (user_id, name, company, email, phone, linkedin_url, title, notes, next_followup_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)", [u.id, ...vals]);
    });
    return { message: "Saved." };
  }, ["/app/recruiters"]);
}

// Calendar --------------------------------------------------------------------------
export async function calendarEventAction(_: ActionState, f: FormData) {
  return act(async () => {
    const op = str(f, "op");
    await withUser(async (tx, u) => {
      if (op === "delete") await tx.query("delete from calendar_events where id = $1", [str(f, "id")]);
      else {
        if (!str(f, "title") || !str(f, "startsAt")) throw new Error("Title and time are required.");
        await tx.query("insert into calendar_events (user_id, title, starts_at, notes, application_id) values ($1,$2,$3::timestamptz,$4,$5)", [u.id, str(f, "title"), str(f, "startsAt"), optStr(f, "notes"), optStr(f, "applicationId")]);
      }
    });
    return { message: "Saved." };
  }, ["/app/calendar"]);
}
