"use client";

import { useActionState, useEffect, useRef, useState, useTransition, createContext, useContext } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Loader2, Mic, MicOff, Moon, Sun, X } from "lucide-react";

type ActionState = { ok: boolean; message?: string; data?: any; at?: number };
type ServerAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; ok: boolean; message: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.ok ? 4000 : 8000);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`fade-in pointer-events-auto card flex items-start gap-2 p-3 text-sm ${t.ok ? "" : "border-bad/40"}`} role={t.ok ? "status" : "alert"}>
            {t.ok ? <Check className="mt-0.5 size-4 shrink-0 text-good" /> : <X className="mt-0.5 size-4 shrink-0 text-bad" />}
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
            <button className="text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Forms bound to server actions
// ---------------------------------------------------------------------------
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  onResult,
  render,
  confirm,
  successToast = true,
  id,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onResult?: (s: ActionState) => void;
  render?: (s: ActionState) => React.ReactNode;
  confirm?: string;
  successToast?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.at) return;
    if (state.message && (successToast || !state.ok)) toast({ ok: state.ok, message: state.message });
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onResult?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return (
    <form
      id={id}
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {render?.(state)}
    </form>
  );
}

export function SubmitButton({ children, className = "btn btn-primary", pendingText, name, value, title }: { children: React.ReactNode; className?: string; pendingText?: string; name?: string; value?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} title={title} aria-busy={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** One-click action button (e.g. "Mark read", "Delete") bound to a server action with hidden fields. */
export function ActionButton({
  action,
  fields = {},
  children,
  className = "btn btn-secondary btn-sm",
  confirm,
  pendingText,
  title,
}: {
  action: ServerAction;
  fields?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
  title?: string;
}) {
  return (
    <ActionForm action={action} confirm={confirm} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className={className} pendingText={pendingText} title={title}>
        {children}
      </SubmitButton>
    </ActionForm>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn btn-secondary btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.dataset.theme = next ? "dark" : "light";
        try {
          localStorage.setItem("cf-theme", next ? "dark" : "light");
        } catch {}
      }}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/** Optional voice input using the browser's speech recognition (audio is processed by the browser vendor). */
export function VoiceInput({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<any>(null);
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t) onText(t.trim());
    };
    r.onend = () => setOn(false);
    rec.current = r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!supported) return <span className="text-xs text-muted">Voice input is not supported in this browser.</span>;
  return (
    <button
      type="button"
      className={`btn btn-sm ${on ? "btn-danger" : "btn-secondary"}`}
      onClick={() => {
        if (on) rec.current?.stop();
        else {
          rec.current?.start();
          setOn(true);
        }
      }}
      aria-pressed={on}
    >
      {on ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      {on ? "Stop" : "Speak"}
    </button>
  );
}

/** Textarea with optional voice dictation appended. */
export function DictationTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { voice?: boolean }) {
  const { voice, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-2">
      <textarea ref={ref} {...rest} />
      {voice && (
        <VoiceInput
          onText={(t) => {
            if (ref.current) ref.current.value = `${ref.current.value}${ref.current.value ? " " : ""}${t}`;
          }}
        />
      )}
    </div>
  );
}

export function useTransitionAction() {
  return useTransition();
}

export function SelectAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((c) => (c.checked = e.target.checked));
      }}
    />
  );
}
