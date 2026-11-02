import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bell, Briefcase, CheckCircle2, FileText, Inbox, MessagesSquare, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { CreatedBy, Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

const features = [
  { icon: Inbox, color: "from-indigo-500 to-violet-500", title: "Gmail-powered tracking", body: "Confirmation emails, recruiter replies, assessments, interviews and offers update the right application automatically. Unclear emails wait for you to confirm." },
  { icon: FileText, color: "from-violet-500 to-fuchsia-500", title: "Truthful tailored resumes", body: "Edits your own DOCX in place, keeping fonts and layout. AI rewording is checked so it never invents skills, numbers or employers." },
  { icon: Briefcase, color: "from-fuchsia-500 to-pink-500", title: "One workspace per job", body: "From saved to offer: the job description, documents, answers, emails, interview prep and timeline stay together." },
  { icon: MessagesSquare, color: "from-pink-500 to-rose-500", title: "Interview intelligence", body: "Role guides, Interview Tomorrow plans, mock interviews, real-world scenarios and a learning loop from your actual interviews." },
  { icon: Target, color: "from-rose-500 to-orange-500", title: "Strategy from your data", body: "Response rates by source and role, follow-ups due, skill gaps from the jobs you save — with the evidence shown." },
  { icon: ShieldCheck, color: "from-orange-500 to-amber-500", title: "Private by design", body: "Row-level isolation, encrypted Google tokens, read-only Gmail access, minimal data sent to AI, full export and deletion." },
];

const steps = [
  { n: "01", title: "Sign in with Google", body: "Your profile and data stay private to you." },
  { n: "02", title: "Connect Gmail (read-only)", body: "Past applications are found and added for you." },
  { n: "03", title: "Let it run", body: "New emails update your pipeline every few minutes." },
];

/** Decorative product preview for the hero. Static sample content, clearly not real data. */
function HeroPreview() {
  const rows = [
    { c: "PhonePe", r: "Operations Executive", s: "Applied", tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
    { c: "Razorpay", r: "Business Analyst", s: "Interview", tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300" },
    { c: "Swiggy", r: "Product Ops", s: "Assessment", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    { c: "Zerodha", r: "Associate", s: "Offer", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="bg-gradient absolute -inset-4 -z-10 rounded-[2rem] opacity-30 blur-2xl" />
      <div className="card card-glow float p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">
            Your pipeline <span className="ml-1 text-[10px] font-medium text-muted">Sample preview</span>
          </p>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
            <span className="pulse-dot size-1.5 rounded-full bg-emerald-500" /> Syncing Gmail
          </span>
        </div>
        <ul className="stagger mt-4 space-y-2.5">
          {rows.map((x) => (
            <li key={x.c} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
              <span className="bg-gradient flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white">{x.c[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{x.c}</span>
                <span className="block truncate text-xs text-muted">{x.r}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.tone}`}>{x.s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card pop-in absolute -right-4 -bottom-6 flex items-center gap-2 px-3 py-2 text-xs font-semibold shadow-lg sm:-right-10" style={{ animationDelay: "0.7s" }}>
        <Bell className="size-4 text-[#ec4899]" /> Interview invite detected
      </div>
      <div className="card pop-in absolute -top-5 -left-4 flex items-center gap-2 px-3 py-2 text-xs font-semibold shadow-lg sm:-left-10" style={{ animationDelay: "0.9s" }}>
        <TrendingUp className="size-4 text-emerald-500" /> Response rate +12%
      </div>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // Supabase falls back to the Site URL when the callback URL is not on its allow-list; finish sign-in anyway.
  const { code } = await searchParams;
  if (code && /^[\w-]{10,}$/.test(code)) redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=%2Fapp`);
  if (await getSessionUser()) redirect("/app");
  return (
    <div className="aurora min-h-dvh">
      <div className="grid-bg absolute inset-x-0 top-0 -z-10 h-[640px]" aria-hidden />
      <div className="orb top-[40%] left-[45%] size-[420px]" aria-hidden />
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/">
            <Logo size={36} />
          </Link>
          <Link href="/login" className="btn btn-primary">
            Sign in <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div className="stagger">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-semibold text-ink-2 shadow-sm">
              <Sparkles className="size-3.5 text-[#a855f7]" /> Built for job seekers in India
            </p>
            <h1 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
              From job search to <span className="text-gradient">job offer</span>, all in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-2 text-pretty">
              CareerFlow AI reads your job emails, tracks every application automatically, tailors your resume truthfully and prepares you for interviews — so you can focus on getting hired.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn btn-primary px-6 py-3 text-[15px]">
                Get started <ArrowRight className="size-4" />
              </Link>
              <a href="#features" className="btn btn-secondary px-6 py-3 text-[15px]">
                See features
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
              {["Read-only Gmail", "No fake data", "Export anytime"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </section>

        <section className="pb-20">
          <div className="card card-glow grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
            {steps.map((s) => (
              <div key={s.n}>
                <p className="text-gradient text-3xl font-extrabold">{s.n}</p>
                <p className="mt-2 font-bold">{s.title}</p>
                <p className="mt-1 text-sm text-ink-2">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="scroll-mt-24 pb-24">
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything your job search needs, <span className="text-gradient">working together</span>
          </h2>
          <div className="stagger mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card card-hover group p-6">
                <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.color} text-white shadow-lg transition duration-300 group-hover:scale-110 group-hover:rotate-6`}>
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-[17px] font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-24">
          <div className="bg-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white shadow-2xl">
            <div className="absolute -top-20 -right-20 size-64 rounded-full bg-white/15 blur-2xl" aria-hidden />
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to land your next role?</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">Connect your Gmail once. CareerFlow keeps your applications up to date from then on.</p>
            <Link href="/login" className="btn mt-7 bg-white px-6 py-3 text-[15px] text-[#7c3aed] shadow-lg hover:-translate-y-0.5 hover:bg-white">
              Start now <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="glass border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Logo size={28} />
          <p className="max-w-md text-center text-xs text-muted">CareerFlow AI does not guarantee jobs, listings or outcomes. AI suggestions should be reviewed before use.</p>
          <CreatedBy className="text-sm" />
        </div>
        <div className="border-t border-line py-6 text-center">
          <p className="text-sm text-ink-2">
            Designed &amp; built with <span className="text-[#ec4899]">♥</span> by{" "}
            <a href="https://ajay-bj-portfolio.netlify.app" target="_blank" rel="noopener noreferrer" className="text-gradient text-base font-extrabold">
              Ajay B J
            </a>
          </p>
          <p className="mt-1 text-xs text-muted">© {new Date().getFullYear()} CareerFlow AI · Owner: Ajay B J</p>
        </div>
      </footer>
    </div>
  );
}
