import Link from "next/link";
import { STATUS_LABEL, statusTone, type ApplicationStatus } from "@careerflow/shared";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold tracking-tight text-balance">{title}</h1>
        <div className="bg-gradient mt-2 h-1 w-12 rounded-full" aria-hidden />
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, className = "", id }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`card p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  info: "bg-info-soft text-info border-transparent",
  progress: "bg-progress-soft text-progress border-transparent",
  good: "bg-good-soft text-good border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: keyof typeof TONE | string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${TONE[tone] ?? TONE.neutral}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-gradient-soft flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="float mb-3 rounded-2xl bg-surface p-3 text-accent shadow-md">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="card card-hover h-full overflow-hidden p-4">
      <div className="bg-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="text-gradient mt-1.5 text-3xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-2">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "bad" | "good"; title?: string; children: React.ReactNode }) {
  const cls = { info: "border-info/30 bg-info-soft", warn: "border-warn/30 bg-warn-soft", bad: "border-bad/30 bg-bad-soft", good: "border-good/30 bg-good-soft" }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`} role={tone === "bad" ? "alert" : "note"}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Tabs({ tabs, active, base }: { tabs: { id: string; label: string; count?: number }[]; active: string; base: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.id}`}
          aria-current={active === t.id ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition ${active === t.id ? "border-[#a855f7] font-semibold text-ink" : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink"}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-muted">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export function MethodTag({ method }: { method: string }) {
  const map: Record<string, [string, string]> = {
    rules: ["Rule-based", "neutral"],
    ai: ["AI", "accent"],
    "rules+ai": ["Rules + AI", "accent"],
    profile: ["From your profile", "good"],
    template: ["Template", "neutral"],
  };
  const [label, tone] = map[method] ?? [method, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Lettermark({ name, size = 40 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 45%)`, fontSize: size * 0.4 }}
    >
      {name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
    </span>
  );
}
