import Link from "next/link";
import { calendarItems } from "@careerflow/core";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { addTaskAction, toggleTaskAction } from "../_actions/applications";
import { calendarEventAction } from "../_actions/misc";

export const metadata = { title: "Calendar & Tasks" };

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const base = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? new Date(`${sp.m}-01T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const d = await withUser(async (tx) => ({
    items: await calendarItems(tx, start, end),
    tasks: await tx.query("select t.*, a.company from tasks t left join applications a on a.id = t.application_id order by t.done_at nulls first, t.due_at nulls last limit 60"),
  }));
  const byDay = new Map<number, any[]>();
  for (const it of d.items) {
    const day = new Date(it.at).getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }
  const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const lead = (start.getDay() + 6) % 7; // Monday first
  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  const today = new Date();
  const tone: Record<string, string> = { interview: "progress", assessment: "warn", task: "neutral", event: "info" };
  return (
    <div className="space-y-6">
      <PageHeader title="Calendar & Tasks" description="Interviews, assessment deadlines, follow-ups and your own events in one place. Reminders are sent in the background." />
      <Card
        title={base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        actions={
          <>
            <Link href={`?m=${key(prev)}`} className="btn btn-secondary btn-sm">
              ‹ Prev
            </Link>
            <Link href="?" className="btn btn-ghost btn-sm">
              Today
            </Link>
            <Link href={`?m=${key(next)}`} className="btn btn-secondary btn-sm">
              Next ›
            </Link>
          </>
        }
      >
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
            <div key={w} className="bg-surface-2 px-2 py-1.5 font-medium text-muted">
              {w}
            </div>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`l${i}`} className="min-h-20 bg-surface" />
          ))}
          {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
            const isToday = today.getFullYear() === base.getFullYear() && today.getMonth() === base.getMonth() && today.getDate() === day;
            return (
              <div key={day} className="min-h-20 bg-surface p-1.5">
                <p className={`mb-1 text-[11px] ${isToday ? "inline-flex size-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink" : "text-muted"}`}>{day}</p>
                <div className="space-y-1">
                  {(byDay.get(day) ?? []).map((it) => (
                    <Link key={`${it.kind}-${it.id}`} href={it.application_id ? `/app/applications/${it.application_id}?tab=prep` : "#"} className="block truncate" title={it.title}>
                      <Badge tone={tone[it.kind]}>
                        {new Date(it.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} {it.title}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tasks">
          <ul className="mb-3 divide-y divide-line">
            {d.tasks.map((t: any) => (
              <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                <ActionButton action={toggleTaskAction} fields={{ id: t.id }} className="btn btn-ghost btn-sm">
                  {t.done_at ? "☑" : "☐"}
                </ActionButton>
                <span className={`flex-1 ${t.done_at ? "text-muted line-through" : ""}`}>
                  {t.title}
                  {t.company && <span className="text-xs text-muted"> · {t.company}</span>}
                </span>
                {t.due_at && <span className="text-xs text-muted">{new Date(t.due_at).toLocaleDateString("en-IN")}</span>}
                {t.source === "system" && <Badge>auto</Badge>}
              </li>
            ))}
          </ul>
          <ActionForm action={addTaskAction} resetOnSuccess className="flex flex-wrap gap-2">
            <input name="title" className="input flex-1" placeholder="New task" required aria-label="Task" />
            <input name="dueAt" type="date" className="input w-auto" aria-label="Due date" />
            <SubmitButton className="btn btn-secondary">Add</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Add an event">
          <ActionForm action={calendarEventAction} resetOnSuccess className="grid gap-2">
            <input type="hidden" name="op" value="create" />
            <input name="title" className="input" placeholder="Title" required />
            <input name="startsAt" type="datetime-local" className="input" required aria-label="Starts at" />
            <textarea name="notes" className="input" rows={2} placeholder="Notes" />
            <SubmitButton className="btn btn-secondary w-fit">Add event</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
