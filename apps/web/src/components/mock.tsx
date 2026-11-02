"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { useToast, VoiceInput } from "./client";

type Action = (prev: any, f: FormData) => Promise<any>;
type Turn = { role: "interviewer" | "candidate"; text: string };

const TYPES = [
  ["hr", "HR"],
  ["behavioral", "Behavioural"],
  ["technical", "Technical"],
  ["managerial", "Managerial"],
  ["scenario", "Scenario-based"],
  ["resume", "Resume-based"],
  ["company", "Company-specific"],
];

export function MockInterview({ start, answer, finish, apps, defaultApp, defaultType, transcriptDefault }: { start: Action; answer: Action; finish: Action; apps: { id: string; label: string }[]; defaultApp?: string; defaultType?: string; transcriptDefault: boolean }) {
  const [session, setSession] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [pending, startT] = useTransition();
  const toast = useToast();
  const box = useRef<HTMLTextAreaElement>(null);

  const call = (action: Action, fd: FormData, then: (d: any) => void) =>
    startT(async () => {
      const r = await action({ ok: false }, fd);
      if (!r.ok) toast({ ok: false, message: r.message ?? "Something went wrong" });
      else then(r.data);
    });

  if (!session)
    return (
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          call(start, fd, (d) => {
            setSession(d.sessionId);
            setTurns([{ role: "interviewer", text: d.question }]);
            setDone(false);
            setFeedback(null);
          });
        }}
      >
        <select name="type" className="input" defaultValue={defaultType ?? "hr"} aria-label="Interview type">
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="applicationId" className="input" defaultValue={defaultApp ?? ""} aria-label="Application">
          <option value="">General practice</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <input name="targetRole" className="input" placeholder="Target role (if no application)" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="saveTranscript" defaultChecked={transcriptDefault} /> Save the transcript (otherwise only feedback is kept)
        </label>
        <button className="btn btn-primary w-fit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />} Start mock interview
        </button>
      </form>
    );

  return (
    <div className="space-y-3">
      <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl bg-surface-2 p-3" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${t.role === "interviewer" ? "bg-surface" : "ml-auto bg-accent-soft"}`}>
            <p className="mb-0.5 text-[11px] font-medium text-muted">{t.role === "interviewer" ? "Interviewer" : "You"}</p>
            <p className="whitespace-pre-line">{t.text}</p>
          </div>
        ))}
        {pending && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>
      {!done && !feedback && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = box.current?.value.trim();
            if (!text) return;
            const fd = new FormData();
            fd.set("sessionId", session);
            fd.set("answer", text);
            setTurns((t) => [...t, { role: "candidate", text }]);
            if (box.current) box.current.value = "";
            call(answer, fd, (d) => {
              if (d.question) setTurns((t) => [...t, { role: "interviewer", text: d.question }]);
              if (d.done) setDone(true);
            });
          }}
        >
          <textarea ref={box} rows={4} className="input" placeholder="Type your answer, or use the microphone" aria-label="Your answer" />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending}>
              <Send className="size-3.5" /> Answer
            </button>
            <VoiceInput onText={(t) => box.current && (box.current.value = `${box.current.value}${box.current.value ? " " : ""}${t}`)} />
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("sessionId", session);
                call(finish, fd, (d) => setFeedback(d));
              }}
            >
              End and get feedback
            </button>
          </div>
        </form>
      )}
      {done && !feedback && (
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("sessionId", session);
            call(finish, fd, (d) => setFeedback(d));
          }}
        >
          {pending && <Loader2 className="size-4 animate-spin" />} Get feedback
        </button>
      )}
      {feedback && (
        <div className="card space-y-3 p-4 text-sm">
          <p className="font-semibold">Feedback <span className="text-xs font-normal text-muted">({feedback.method === "ai" ? "AI, based on your answers" : "rule-based checks of your answers"})</span></p>
          <p className="text-ink-2">{feedback.feedback.summary}</p>
          {feedback.feedback.perAnswer?.map((p: any, i: number) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <p className="font-medium">{p.question}</p>
              <p className="text-ink-2">{p.observation}</p>
              <p className="mt-1 text-xs">Try: {p.suggestion}</p>
            </div>
          ))}
          {feedback.feedback.improvements?.length > 0 && (
            <div>
              <p className="font-medium">To improve</p>
              <ul className="list-disc pl-5 text-ink-2">
                {feedback.feedback.improvements.map((x: string, i: number) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSession(null);
              setTurns([]);
              setFeedback(null);
            }}
          >
            New mock interview
          </button>
        </div>
      )}
    </div>
  );
}
