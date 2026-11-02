"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard, Bell, CalendarDays, Compass, Globe, Bookmark, Briefcase, PanelsTopLeft, Inbox, FileText, Mail, Sparkles, FolderLock, MessagesSquare, FlaskConical, GraduationCap, Target, ChartColumn, Building2, Contact, Send, BadgeIndianRupee, ShieldAlert, UserRound, Linkedin, Rocket, Route, Settings, Search, X, Menu, Waypoints, Circle } from "lucide-react";
const Icons = { LayoutDashboard, Bell, CalendarDays, Compass, Globe, Bookmark, Briefcase, PanelsTopLeft, Inbox, FileText, Mail, Sparkles, FolderLock, MessagesSquare, FlaskConical, GraduationCap, Target, ChartColumn, Building2, Contact, Send, BadgeIndianRupee, ShieldAlert, UserRound, Linkedin, Rocket, Route, Settings, Search, X, Menu, Waypoints, Circle };
import { ArrowLeft, ChevronRight } from "lucide-react";
import { NAV } from "@/lib/nav";
import { ThemeToggle, ToastProvider } from "./client";
import { CreatedBy, Logo } from "./logo";

function Icon({ name, className = "size-4" }: { name: string; className?: string }) {
  const C = (Icons as any)[name] ?? Icons.Circle;
  return <C className={className} aria-hidden />;
}

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

const NAV_ITEMS = NAV.flatMap((g) => g.items);
const EXTRA_LABELS: Record<string, string> = { new: "New", tailor: "Tailor" };

/** The menu page a path belongs to (e.g. /app/applications/123 → Applications). */
function sectionOf(path: string) {
  return NAV_ITEMS.filter((it) => it.href !== "/app" && isActive(path, it.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

/** Where "Back" goes when there is no in-app history: the section page, or the dashboard. */
function parentOf(path: string) {
  const section = sectionOf(path);
  if (section && section.href !== path) return section.href;
  return "/app";
}

function BackBar({ path, canGoBack }: { path: string; canGoBack: boolean }) {
  const router = useRouter();
  if (path === "/app") return null;
  const section = sectionOf(path);
  const rest = section ? path.slice(section.href.length).split("/").filter(Boolean) : [];
  const last = rest[rest.length - 1];
  const detail = last ? (EXTRA_LABELS[last] ?? (rest.includes("tailor") ? "Tailor" : "Details")) : null;
  const goBack = () => (canGoBack ? router.back() : router.push(parentOf(path)));
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button onClick={goBack} className="btn btn-secondary btn-sm group" aria-label="Go back">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Back
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
        <Link href="/app" className="flex items-center gap-1 hover:text-accent">
          <Icons.LayoutDashboard className="size-3.5" /> Dashboard
        </Link>
        {section && (
          <>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            {detail ? (
              <Link href={section.href} className="truncate hover:text-accent">
                {section.label}
              </Link>
            ) : (
              <span className="truncate font-semibold text-ink" aria-current="page">
                {section.label}
              </span>
            )}
          </>
        )}
        {detail && (
          <>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-semibold text-ink" aria-current="page">
              {detail}
            </span>
          </>
        )}
      </nav>
    </div>
  );
}

function SideNav({ onNavigate, counts }: { onNavigate?: () => void; counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-5 px-3 py-4">
      {NAV.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              const n = counts[it.href];
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`nav-item flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13.5px] ${active ? "" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
                  >
                    <Icon name={it.icon} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {n ? <span className="bg-gradient rounded-full px-1.5 text-[10.5px] font-bold text-white tabular-nums shadow-sm">{n > 99 ? "99+" : n}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => {
    const all = NAV.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label })));
    const t = q.toLowerCase().trim();
    return t ? all.filter((it) => `${it.label} ${it.group} ${it.keywords ?? ""}`.toLowerCase().includes(t)) : all;
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);
  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="card card-glow pop-in w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icons.Search className="size-4 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setI((x) => Math.min(items.length - 1, x + 1));
              if (e.key === "ArrowUp") setI((x) => Math.max(0, x - 1));
              if (e.key === "Enter" && items[i]) go(items[i].href);
              if (e.key === "Escape") onClose();
            }}
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            placeholder="Go to…"
            aria-label="Search pages"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.map((it, idx) => (
            <li key={it.href} role="option" aria-selected={idx === i}>
              <button onMouseEnter={() => setI(idx)} onClick={() => go(it.href)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${idx === i ? "bg-gradient-soft text-ink" : ""}`}>
                <Icon name={it.icon} className="size-4 text-muted" />
                <span className="flex-1">{it.label}</span>
                <span className="text-xs text-muted">{it.group}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

export function AppShell({ children, user, counts, signOut, banner }: { children: React.ReactNode; user: { email: string | null; name: string | null }; counts: Record<string, number>; signOut: () => Promise<void>; banner?: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const path = usePathname();
  useEffect(() => setDrawer(false), [path]);
  // Count page changes inside the app, so Back can use browser history when it stays in the app
  const visits = useRef(0);
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    visits.current += 1;
    setCanGoBack(visits.current > 1);
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line lg:flex">
          <Link href="/app" className="px-5 pt-5 pb-2">
            <Logo size={34} />
          </Link>
          <div className="flex-1">
            <SideNav counts={counts} />
          </div>
          <div className="bg-gradient-soft mx-3 mb-4 rounded-2xl border border-line px-3 py-3">
            <CreatedBy />
          </div>
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="fade-in absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <aside className="pop-in absolute inset-y-0 left-0 w-72 overflow-y-auto bg-surface shadow-xl">
              <div className="flex items-center justify-between px-5 pt-4">
                <Logo size={30} />
                <button className="btn btn-ghost btn-sm" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <Icons.X className="size-4" />
                </button>
              </div>
              <SideNav counts={counts} onNavigate={() => setDrawer(false)} />
              <CreatedBy className="px-5 pb-6" />
            </aside>
          </div>
        )}
        <div className="aurora flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line px-4">
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Icons.Menu className="size-4" />
            </button>
            <button onClick={() => setPalette(true)} className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 text-left text-sm text-muted transition hover:border-accent hover:shadow-[0_0_0_3px_var(--ring)]">
              <Icons.Search className="size-4" />
              <span className="flex-1">Search pages…</span>
              <kbd className="hidden rounded border border-line px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <Link href="/app/notifications" className="btn btn-ghost btn-sm relative" aria-label={`Notifications${counts["/app/notifications"] ? `, ${counts["/app/notifications"]} unread` : ""}`}>
                <Icons.Bell className="size-4" />
                {counts["/app/notifications"] ? <span className="pulse-dot absolute top-1 right-1 size-2 rounded-full bg-[#ec4899]" /> : null}
              </Link>
              <ThemeToggle />
              <details className="relative">
                <summary className="btn btn-ghost btn-sm list-none" aria-label="Account menu">
                  <span className="bg-gradient flex size-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-md">{(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}</span>
                </summary>
                <div className="card pop-in absolute right-0 mt-2 w-60 p-2 text-sm">
                  <p className="truncate px-2 py-1.5 text-ink-2">{user.email}</p>
                  <Link href="/app/profile" className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    Career profile
                  </Link>
                  <Link href="/app/settings" className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    Settings
                  </Link>
                  <form action={signOut}>
                    <button className="w-full rounded-lg px-2 py-1.5 text-left text-bad hover:bg-bad-soft">Sign out</button>
                  </form>
                </div>
              </details>
            </div>
          </header>
          {banner}
          <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <BackBar path={path} canGoBack={canGoBack} />
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </ToastProvider>
  );
}
