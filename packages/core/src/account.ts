import type { Database } from "@careerflow/database";
import { zipFiles } from "@careerflow/document-engine";
import { disconnectGmail } from "./gmail-sync";
import { getStorage } from "./storage";

const EXPORT_TABLES = [
  "profiles",
  "career_profiles",
  "user_preferences",
  "employment_history",
  "education",
  "verified_skills",
  "certifications",
  "portfolio_projects",
  "verified_achievements",
  "applications",
  "status_history",
  "application_events",
  "recruiter_contacts",
  "companies",
  "job_listings",
  "job_alerts",
  "saved_searches",
  "documents",
  "master_resumes",
  "job_match_reports",
  "tailored_resumes",
  "cover_letters",
  "generated_answers",
  "approved_answers",
  "interviews",
  "assessments",
  "learning_paths",
  "learning_modules",
  "scenario_attempts",
  "mock_interview_sessions",
  "mock_interview_feedback",
  "post_interview_reviews",
  "weaknesses",
  "skill_progress",
  "tasks",
  "calendar_events",
  "notifications",
  "outreach_drafts",
  "offers",
  "compensation_components",
  "scam_checks",
  "processed_messages",
  "email_classifications",
  "review_queue",
];

/** ZIP with all the user's data as JSON plus their uploaded/generated files. OAuth tokens are never exported. */
export async function exportAccountData(db: Database, userId: string) {
  const data: Record<string, unknown[]> = {};
  const docs = await db.withUser(userId, async (tx) => {
    for (const t of EXPORT_TABLES) data[t] = await tx.query(`select * from ${t}`);
    data.gmail_connection = await tx.query("select google_email, scopes, status, connected_at from gmail_connections");
    return tx.query<{ id: string; title: string; storage_path: string }>("select id, title, storage_path from documents");
  });
  const files: { name: string; data: Buffer | string }[] = [{ name: "careerflow-data.json", data: JSON.stringify(data, null, 2) }];
  for (const d of docs) {
    try {
      files.push({ name: `files/${d.id.slice(0, 8)}-${d.title.replace(/[^\w.\- ]+/g, "_")}`, data: await getStorage().get(d.storage_path) });
    } catch {
      /* missing file */
    }
  }
  return zipFiles(files.map((f) => ({ name: f.name, data: typeof f.data === "string" ? Buffer.from(f.data) : f.data })));
}

/** Deletes the account: revokes Gmail, removes stored files, then deletes the auth user (all rows cascade). */
export async function deleteAccount(db: Database, userId: string, opts: { deleteAuthUser: (userId: string) => Promise<void> }) {
  await disconnectGmail(db, userId, { deleteImportedData: true }).catch(() => {});
  const docs = await db.withUser(userId, (tx) => tx.query<{ storage_path: string }>("select storage_path from documents"));
  for (const d of docs) await getStorage().remove(d.storage_path).catch(() => {});
  await opts.deleteAuthUser(userId);
  await db.asService((tx) => tx.query("delete from auth.users where id = $1", [userId])).catch(() => {});
}
