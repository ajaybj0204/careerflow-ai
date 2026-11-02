import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, FileText, Inbox, MessagesSquare, ShieldCheck, Target } from "lucide-react";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const features = [
  { icon: Inbox, title: "Gmail-powered tracking", body: "Confirmation emails, recruiter replies, assessments, interviews and offers update the right application automatically. Unclear emails wait for you to confirm." },
  { icon: FileText, title: "Truthful tailored resumes", body: "Edits your own DOCX in place, keeping fonts and layout. AI rewording is checked so it never invents skills, numbers or employers." },
  { icon: Briefcase, title: "One workspace per job", body: "From saved to offer: the job description, documents, answers, emails, interview prep and timeline stay together." },
  { icon: MessagesSquare, title: "Interview intelligence", body: "Role guides, Interview Tomorrow plans, mock interviews, real-world scenarios and a learning loop from your actual interviews." },
  { icon: Target, title: "Strategy from your data", body: "Response rates by source and role, follow-ups due, skill gaps from the jobs you save — with the evidence shown." },
  { icon: ShieldCheck, title: "Private by design", body: "Row-level isolation, encrypted Google tokens, read-only Gmail access, minimal data sent to AI, full export and deletion." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // Supabase falls back to the Site URL when the callback URL is not on its allow-list; finish sign-in anyway.
  const { code } = await searchParams;
  if (code && /^[\w-]{10,}$/.test(code)) redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=%2Fapp`);
  if (await getSessionUser()) redirect("/app");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-semibold tracking-tight">CareerFlow AI</span>
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 sm:py-24">
          <p className="text-sm font-medium text-accent">Built for job seekers in India</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">From job search to job offer, all in one place.</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2 text-pretty">
            CareerFlow AI keeps one verified career profile and one application database, and connects job discovery, tailored documents, Gmail tracking, interview preparation and offer decisions around them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary px-5 py-2.5 text-[15px]">
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon className="size-5 text-accent" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">CareerFlow AI does not guarantee jobs, listings or outcomes. AI suggestions should be reviewed before use.</footer>
    </div>
  );
}
