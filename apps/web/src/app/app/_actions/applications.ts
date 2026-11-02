"use server";

import { redirect } from "next/navigation";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@careerflow/shared";
import { bulkUpdate, createApplication, deleteApplication, markSubmittedVersion, recordEvent, setStatusManually, unlockStatus, updateApplication } from "@careerflow/core";
import { act, optStr, str, type ActionState } from "@/lib/action";
import { withUser } from "@/lib/session";

function appInput(f: FormData) {
  return {
    company: str(f, "company"),
    roleTitle: str(f, "roleTitle"),
    location: optStr(f, "location"),
    workMode: (optStr(f, "workMode") as any) ?? null,
    jobUrl: optStr(f, "jobUrl"),
    jobPortal: optStr(f, "jobPortal"),
    externalJobId: optStr(f, "externalJobId"),
    jobDescription: optStr(f, "jobDescription"),
    status: (str(f, "status") || "saved") as ApplicationStatus,
    appliedAt: optStr(f, "appliedAt"),
    salaryText: optStr(f, "salaryText"),
    notes: optStr(f, "notes"),
    nextAction: optStr(f, "nextAction"),
    nextActionDue: optStr(f, "nextActionDue"),
  };
}

export async function createApplicationAction(_: ActionState, f: FormData) {
  let target: string | null = null;
  const r = await act(async () => {
    const res = await withUser((tx, u) => createApplication(tx, u.id, appInput(f), { allowDuplicate: f.get("allowDuplicate") === "1" }));
    target = `/app/applications/${res.application.id}${res.duplicateOf ? "?duplicate=1" : ""}`;
  }, ["/app/applications", "/app/saved"]);
  if (r.ok && target) redirect(target);
  return r;
}

export async function updateApplicationAction(_: ActionState, f: FormData) {
  return act(async () => {
    const id = str(f, "id");
    const input = appInput(f);
    const { status: _s, ...rest } = input;
    void _s;
    await withUser((tx, u) => updateApplication(tx, u.id, id, rest));
    return { message: "Saved." };
  }, ["/app/applications/[id]"]);
}

export async function setStatusAction(_: ActionState, f: FormData) {
  return act(async () => {
    const status = str(f, "status") as ApplicationStatus;
    if (!APPLICATION_STATUSES.includes(status)) throw new Error("Invalid status");
    const r = await withUser((tx, u) => setStatusManually(tx, u.id, str(f, "id"), status, optStr(f, "reason") ?? undefined));
    return { message: r === "unchanged" ? "Status unchanged." : "Status updated." };
  }, ["/app/applications", "/app/applications/[id]", "/app/saved", "/app"]);
}

export async function unlockStatusAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => unlockStatus(tx, str(f, "id")));
    return { message: "Automation may now update this status (outcomes still need your confirmation)." };
  }, ["/app/applications/[id]"]);
}

export async function deleteApplicationAction(_: ActionState, f: FormData) {
  const r = await act(async () => {
    await withUser((tx) => deleteApplication(tx, str(f, "id")));
  }, ["/app/applications"]);
  if (r.ok) redirect("/app/applications");
  return r;
}

export async function bulkAction(_: ActionState, f: FormData) {
  return act(async () => {
    const ids = f.getAll("ids").map(String).filter(Boolean);
    if (!ids.length) throw new Error("Select at least one application.");
    const op = str(f, "op");
    if (op === "delete") await withUser((tx, u) => bulkUpdate(tx, u.id, ids, { delete: true }));
    else if (op === "archive") await withUser((tx, u) => bulkUpdate(tx, u.id, ids, { archive: true }));
    else if (op === "unarchive") await withUser((tx, u) => bulkUpdate(tx, u.id, ids, { archive: false }));
    else if (APPLICATION_STATUSES.includes(op as ApplicationStatus)) await withUser((tx, u) => bulkUpdate(tx, u.id, ids, { status: op as ApplicationStatus }));
    else throw new Error("Choose an action.");
    return { message: `Updated ${ids.length} application(s).` };
  }, ["/app/applications", "/app/saved"]);
}

export async function addNoteAction(_: ActionState, f: FormData) {
  return act(async () => {
    const note = str(f, "note").slice(0, 3000);
    if (!note) throw new Error("Write a note first.");
    await withUser(async (tx, u) => {
      const id = str(f, "id");
      await tx.query("update applications set notes = trim(both from coalesce(notes, '') || E'\\n\\n' || $2) where id = $1", [id, `[${new Date().toLocaleDateString("en-IN")}] ${note}`]);
      await recordEvent(tx, u.id, { applicationId: id, type: "note_added", source: "manual", payload: { note: note.slice(0, 200) } });
    });
    return { message: "Note added." };
  }, ["/app/applications/[id]"]);
}

export async function addInterviewAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser(async (tx, u) => {
      const appId = optStr(f, "applicationId");
      await tx.query("insert into interviews (user_id, application_id, round_type, scheduled_at, duration_minutes, mode, location_or_link, interviewer, status, notes) values ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,'scheduled',$9)", [
        u.id,
        appId,
        str(f, "roundType") || "other",
        optStr(f, "scheduledAt"),
        Number(str(f, "duration")) || null,
        str(f, "mode") || "unknown",
        optStr(f, "link"),
        optStr(f, "interviewer"),
        optStr(f, "notes"),
      ]);
      if (appId) {
        await recordEvent(tx, u.id, { applicationId: appId, type: "interview_scheduled", source: "manual", occurredAt: new Date() });
        await setStatusManually(tx, u.id, appId, "interview_scheduled", "Interview added").catch(() => {});
      }
    });
    return { message: "Interview added." };
  }, ["/app/applications/[id]", "/app/interview", "/app/calendar"]);
}

export async function updateInterviewAction(_: ActionState, f: FormData) {
  return act(async () => {
    const status = str(f, "status");
    if (!["scheduled", "rescheduled", "completed", "cancelled"].includes(status)) throw new Error("Invalid status");
    await withUser((tx) => tx.query("update interviews set status = $2, scheduled_at = coalesce($3::timestamptz, scheduled_at) where id = $1", [str(f, "id"), status, optStr(f, "scheduledAt")]));
    return { message: "Interview updated." };
  }, ["/app/applications/[id]", "/app/interview", "/app/calendar"]);
}

export async function addAssessmentAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser(async (tx, u) => {
      const appId = optStr(f, "applicationId");
      await tx.query("insert into assessments (user_id, application_id, title, platform, link, deadline) values ($1,$2,$3,$4,$5,$6::timestamptz)", [u.id, appId, str(f, "title") || "Assessment", optStr(f, "platform"), optStr(f, "link"), optStr(f, "deadline")]);
      if (appId) await recordEvent(tx, u.id, { applicationId: appId, type: "assessment_assigned", source: "manual" });
    });
    return { message: "Assessment added." };
  }, ["/app/applications/[id]", "/app/calendar"]);
}

export async function completeAssessmentAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser(async (tx, u) => {
      const a = await tx.one("update assessments set status = 'completed' where id = $1 returning application_id", [str(f, "id")]);
      if (a?.application_id) await setStatusManually(tx, u.id, a.application_id, "assessment_completed", "Assessment completed").catch(() => {});
    });
    return { message: "Marked completed." };
  }, ["/app/applications/[id]", "/app/calendar", "/app"]);
}

export async function markSubmittedAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => markSubmittedVersion(tx, str(f, "applicationId"), str(f, "tailoredId")));
    return { message: "Recorded as the resume version you submitted." };
  }, ["/app/applications/[id]"]);
}

export async function addTaskAction(_: ActionState, f: FormData) {
  return act(async () => {
    const title = str(f, "title");
    if (!title) throw new Error("Task title is required.");
    await withUser((tx, u) => tx.query("insert into tasks (user_id, application_id, kind, title, due_at) values ($1,$2,$3,$4,$5::timestamptz)", [u.id, optStr(f, "applicationId"), str(f, "kind") || "todo", title.slice(0, 300), optStr(f, "dueAt")]));
    return { message: "Task added." };
  }, ["/app/calendar", "/app", "/app/applications/[id]"]);
}

export async function toggleTaskAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update tasks set done_at = case when done_at is null then now() else null end where id = $1", [str(f, "id")]));
  }, ["/app/calendar", "/app", "/app/applications/[id]"]);
}

export async function linkRecruiterAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update applications set recruiter_id = $2 where id = $1", [str(f, "id"), optStr(f, "recruiterId")]));
    return { message: "Recruiter linked." };
  }, ["/app/applications/[id]"]);
}
