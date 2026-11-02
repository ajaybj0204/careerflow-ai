import {
  STATUS_LABEL,
  applicationDedupeKey,
  applicationInput,
  normalizeCompany,
  tokenSimilarity,
  type ApplicationInput,
  type ApplicationStatus,
} from "@careerflow/shared";
import type { Tx } from "@careerflow/database";
import { changeStatus, notify, recordEvent, type EventSource } from "./automation";

export interface ApplicationRow {
  id: string;
  company: string;
  role_title: string;
  location: string | null;
  work_mode: string | null;
  job_url: string | null;
  job_portal: string | null;
  external_job_id: string | null;
  external_application_id: string | null;
  job_description: string | null;
  status: ApplicationStatus;
  status_locked: boolean;
  status_source: string;
  applied_at: string | null;
  confirmation_received_at: string | null;
  last_activity_at: string;
  next_action: string | null;
  next_action_due: string | null;
  recruiter_id: string | null;
  resume_version_id: string | null;
  salary_text: string | null;
  notes: string | null;
  gmail_thread_ids: string[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Finds likely duplicates: same dedupe key, same job id, or same company with a very similar role. */
export async function findDuplicates(tx: Tx, input: { company: string; roleTitle: string; externalJobId?: string | null; jobUrl?: string | null }, excludeId?: string) {
  const key = applicationDedupeKey(input);
  const rows = await tx.query<ApplicationRow>(
    "select * from applications where id is distinct from $1 and (dedupe_key = $2 or (job_url is not null and job_url = $3) or (external_job_id is not null and external_job_id = $4) or lower(company) like $5)",
    [excludeId ?? null, key, input.jobUrl ?? null, input.externalJobId ?? null, `%${normalizeCompany(input.company)}%`],
  );
  return rows.filter(
    (r) =>
      r.job_url === input.jobUrl && !!input.jobUrl ||
      (r.external_job_id && r.external_job_id === input.externalJobId) ||
      (normalizeCompany(r.company) === normalizeCompany(input.company) && tokenSimilarity(r.role_title, input.roleTitle) >= 0.75),
  );
}

export async function createApplication(
  tx: Tx,
  userId: string,
  raw: Partial<ApplicationInput> & { company: string; roleTitle: string },
  opts: { source?: EventSource; allowDuplicate?: boolean; jobListingId?: string | null } = {},
): Promise<{ application: ApplicationRow; duplicateOf?: ApplicationRow }> {
  const input = applicationInput.parse(raw);
  if (!opts.allowDuplicate) {
    const dups = await findDuplicates(tx, input);
    if (dups.length) return { application: dups[0], duplicateOf: dups[0] };
  }
  const source = opts.source ?? "manual";
  const key = applicationDedupeKey(input);
  const app = await tx.one<ApplicationRow>(
    `insert into applications (user_id, company, role_title, location, work_mode, job_url, job_portal, external_job_id, job_description, status,
       status_source, status_locked, applied_at, salary_text, notes, next_action, next_action_due, dedupe_key, job_listing_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14,$15,$16,$17::timestamptz,$18,$19) returning *`,
    [
      userId,
      input.company,
      input.roleTitle,
      input.location,
      input.workMode ?? null,
      input.jobUrl,
      input.jobPortal,
      input.externalJobId,
      input.jobDescription,
      input.status,
      source,
      source === "manual" && input.status !== "saved" && input.status !== "preparing",
      input.appliedAt ?? (input.status === "applied" && source === "manual" ? new Date().toISOString() : null),
      input.salaryText,
      input.notes,
      input.nextAction,
      input.nextActionDue,
      opts.allowDuplicate ? null : key,
      opts.jobListingId ?? null,
    ],
  );
  await tx.query("insert into status_history (user_id, application_id, from_status, to_status, source, reason) values ($1,$2,null,$3,$4,'created')", [userId, app!.id, input.status, source]);
  await recordEvent(tx, userId, { applicationId: app!.id, type: "job_saved", source, payload: { company: input.company, role: input.roleTitle } });
  if (!["saved", "preparing"].includes(input.status)) {
    await recordEvent(tx, userId, { applicationId: app!.id, type: "application_submitted", source, occurredAt: input.appliedAt ?? null });
  }
  return { application: app! };
}

export async function updateApplication(tx: Tx, userId: string, id: string, raw: Partial<ApplicationInput>) {
  const current = await tx.one<ApplicationRow>("select * from applications where id = $1", [id]);
  if (!current) throw new Error("Application not found");
  const merged = applicationInput.parse({
    company: raw.company ?? current.company,
    roleTitle: raw.roleTitle ?? current.role_title,
    location: raw.location !== undefined ? raw.location : current.location,
    workMode: raw.workMode !== undefined ? raw.workMode : current.work_mode,
    jobUrl: raw.jobUrl !== undefined ? raw.jobUrl : current.job_url,
    jobPortal: raw.jobPortal !== undefined ? raw.jobPortal : current.job_portal,
    externalJobId: raw.externalJobId !== undefined ? raw.externalJobId : current.external_job_id,
    jobDescription: raw.jobDescription !== undefined ? raw.jobDescription : current.job_description,
    status: current.status,
    appliedAt: raw.appliedAt !== undefined ? raw.appliedAt : current.applied_at,
    salaryText: raw.salaryText !== undefined ? raw.salaryText : current.salary_text,
    notes: raw.notes !== undefined ? raw.notes : current.notes,
    nextAction: raw.nextAction !== undefined ? raw.nextAction : current.next_action,
    nextActionDue: raw.nextActionDue !== undefined ? raw.nextActionDue : current.next_action_due,
  });
  await tx.query(
    `update applications set company=$2, role_title=$3, location=$4, work_mode=$5, job_url=$6, job_portal=$7, external_job_id=$8, job_description=$9,
       applied_at=$10::timestamptz, salary_text=$11, notes=$12, next_action=$13, next_action_due=$14::timestamptz where id=$1`,
    [id, merged.company, merged.roleTitle, merged.location, merged.workMode ?? null, merged.jobUrl, merged.jobPortal, merged.externalJobId, merged.jobDescription, merged.appliedAt, merged.salaryText, merged.notes, merged.nextAction, merged.nextActionDue],
  );
  if (raw.status && raw.status !== current.status) await changeStatus(tx, userId, id, raw.status, { source: "manual", reason: "Changed by you" });
  if (raw.notes && raw.notes !== current.notes) await recordEvent(tx, userId, { applicationId: id, type: "note_added", source: "manual" });
}

export async function setStatusManually(tx: Tx, userId: string, id: string, status: ApplicationStatus, reason?: string) {
  const r = await changeStatus(tx, userId, id, status, { source: "manual", reason: reason ?? "Changed by you" });
  if (r === "applied" && status === "applied") await recordEvent(tx, userId, { applicationId: id, type: "application_submitted", source: "manual" });
  return r;
}

export async function unlockStatus(tx: Tx, id: string) {
  await tx.query("update applications set status_locked = false where id = $1", [id]);
}

export async function deleteApplication(tx: Tx, id: string) {
  await tx.query("delete from applications where id = $1", [id]);
}

export interface ApplicationFilter {
  q?: string;
  status?: string;
  portal?: string;
  sort?: "last_activity" | "applied" | "company" | "created";
  archived?: boolean;
  from?: string;
  to?: string;
}

export async function listApplications(tx: Tx, f: ApplicationFilter = {}) {
  const where: string[] = ["a.archived = $1"];
  const params: unknown[] = [!!f.archived];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.q) {
    const p = add(`%${f.q.toLowerCase()}%`);
    where.push(`(lower(a.company) like ${p} or lower(a.role_title) like ${p} or lower(coalesce(a.location,'')) like ${p})`);
  }
  if (f.status === "active") where.push("a.status not in ('rejected','withdrawn','offer_accepted','selected','saved','preparing')");
  else if (f.status) where.push(`a.status = ${add(f.status)}`);
  if (f.portal) where.push(`a.job_portal = ${add(f.portal)}`);
  if (f.from) where.push(`coalesce(a.applied_at, a.created_at) >= ${add(f.from)}::timestamptz`);
  if (f.to) where.push(`coalesce(a.applied_at, a.created_at) < (${add(f.to)}::date + 1)`);
  const order =
    f.sort === "company"
      ? "lower(a.company), a.role_title"
      : f.sort === "applied"
        ? "a.applied_at desc nulls last"
        : f.sort === "created"
          ? "a.created_at desc"
          : "a.last_activity_at desc";
  return tx.query<ApplicationRow & { recruiter_name: string | null; email_count: number }>(
    `select a.*, r.name as recruiter_name, (select count(*)::int from application_email_links l where l.application_id = a.id) as email_count
     from applications a left join recruiter_contacts r on r.id = a.recruiter_id
     where ${where.join(" and ")}
     order by ${order}`,
    params,
  );
}

/** Everything about one application, for the Universal Workspace. */
export async function getWorkspace(tx: Tx, id: string) {
  const app = await tx.one<ApplicationRow>("select * from applications where id = $1", [id]);
  if (!app) return null;
  const [events, history, documents, emails, interviews, assessments, answers, reports, tailored, letters, recruiter, tasks, reviews, mocks] = await Promise.all([
    tx.query("select * from application_events where application_id = $1 order by occurred_at desc, created_at desc", [id]),
    tx.query("select * from status_history where application_id = $1 order by created_at desc", [id]),
    tx.query("select * from documents where application_id = $1 order by created_at desc", [id]),
    tx.query(
      `select m.*, l.match_confidence, l.confirmed_by_user, c.category, c.extracted from application_email_links l
       join processed_messages m on m.id = l.processed_message_id left join email_classifications c on c.processed_message_id = m.id
       where l.application_id = $1 order by m.internal_date desc`,
      [id],
    ),
    tx.query("select * from interviews where application_id = $1 order by scheduled_at desc nulls last", [id]),
    tx.query("select * from assessments where application_id = $1 order by deadline nulls last", [id]),
    tx.query("select * from approved_answers where application_id = $1 order by updated_at desc", [id]),
    tx.query("select * from job_match_reports where application_id = $1 order by created_at desc", [id]),
    tx.query("select * from tailored_resumes where application_id = $1 order by created_at desc", [id]),
    tx.query("select * from cover_letters where application_id = $1 order by created_at desc", [id]),
    app.recruiter_id ? tx.one("select * from recruiter_contacts where id = $1", [app.recruiter_id]) : Promise.resolve(null),
    tx.query("select * from tasks where application_id = $1 order by done_at nulls first, due_at nulls last", [id]),
    tx.query("select * from post_interview_reviews where application_id = $1 order by created_at desc", [id]),
    tx.query("select id, interview_type, status, created_at from mock_interview_sessions where application_id = $1 order by created_at desc", [id]),
  ]);
  return { app, events, history, documents, emails, interviews, assessments, answers, reports, tailored, letters, recruiter, tasks, reviews, mocks };
}

export const EXPORT_HEADERS = [
  "Company",
  "Role",
  "Location",
  "Status",
  "Job portal",
  "Applied at (known)",
  "Confirmation email at",
  "Last activity",
  "Next action",
  "Next action due",
  "Recruiter",
  "Job URL",
  "Salary",
  "Notes",
];

export function exportRows(apps: (ApplicationRow & { recruiter_name?: string | null })[]) {
  return apps.map((a) => [
    a.company,
    a.role_title,
    a.location,
    STATUS_LABEL[a.status],
    a.job_portal,
    a.applied_at ? new Date(a.applied_at) : null,
    a.confirmation_received_at ? new Date(a.confirmation_received_at) : null,
    new Date(a.last_activity_at),
    a.next_action,
    a.next_action_due ? new Date(a.next_action_due) : null,
    a.recruiter_name ?? null,
    a.job_url,
    a.salary_text,
    a.notes,
  ]);
}

export async function bulkUpdate(tx: Tx, userId: string, ids: string[], action: { status?: ApplicationStatus; archive?: boolean; delete?: boolean }) {
  for (const id of ids.slice(0, 500)) {
    if (action.delete) await deleteApplication(tx, id);
    else if (action.archive !== undefined) await tx.query("update applications set archived = $2 where id = $1", [id, action.archive]);
    else if (action.status) await setStatusManually(tx, userId, id, action.status, "Bulk update");
  }
}

/** Creates follow-up tasks for applications with no activity for N days (silence is never treated as rejection). */
export async function scheduleFollowUps(tx: Tx, userId: string, days = 10) {
  const stale = await tx.query<ApplicationRow>(
    `select * from applications where not archived and status in ('applied','acknowledged','under_review')
       and last_activity_at < now() - ($1 || ' days')::interval`,
    [String(days)],
  );
  let created = 0;
  for (const a of stale) {
    const r = await tx.query(
      `insert into tasks (user_id, application_id, kind, title, due_at, source, dedupe_key) values ($1,$2,'follow_up',$3,now(),'system',$4)
       on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id`,
      [userId, a.id, `Follow up with ${a.company} about ${a.role_title}`, `followup:${a.id}:${new Date(a.last_activity_at).toISOString().slice(0, 10)}`],
    );
    if (r.length) {
      created++;
      await recordEvent(tx, userId, { applicationId: a.id, type: "follow_up_due", source: "system", dedupeKey: `followup-event:${a.id}:${new Date(a.last_activity_at).toISOString().slice(0, 10)}` });
      await notify(tx, userId, { type: "follow_up_due", title: `Follow up: ${a.company}`, body: `No reply for ${days}+ days on ${a.role_title}.`, link: `/app/applications/${a.id}`, dedupeKey: `followup:${a.id}:${new Date(a.last_activity_at).toISOString().slice(0, 10)}` });
    }
  }
  return created;
}
