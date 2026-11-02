import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";

export const metadata = { title: "Fresher Career Launchpad" };

export default async function Launchpad() {
  const c = await withUser((tx) =>
    tx.one(
      `select (select count(*)::int from education where verified) as edu,
              (select count(*)::int from portfolio_projects where verified and status = 'completed') as projects,
              (select count(*)::int from verified_skills where verified) as skills,
              (select count(*)::int from certifications where verified) as certs,
              (select count(*)::int from employment_history where verified) as internships,
              (select count(*)::int from master_resumes) as resumes,
              (select count(*)::int from skill_progress where activity_type = 'exercise' and skill = 'Aptitude') as aptitude,
              (select count(*)::int from mock_interview_sessions where status = 'completed') as mocks,
              (select count(*)::int from applications where status not in ('saved','preparing')) as applied,
              (select array_length(target_roles,1) from career_profiles limit 1) as targets`,
    ),
  );
  const steps: [boolean, string, string, string][] = [
    [!!c?.targets, "Choose target roles", "Pick 2–3 entry-level roles to focus on.", "/app/profile"],
    [(c?.edu ?? 0) > 0, "Add your education", "Degree, institution, year and grade.", "/app/profile#education"],
    [(c?.projects ?? 0) > 0, "Add academic or personal projects", "Completed projects count as real experience — ideas do not.", "/app/profile#portfolio_projects"],
    [(c?.internships ?? 0) > 0, "Add internships or volunteer work", "Add them under Employment history.", "/app/profile#employment_history"],
    [(c?.skills ?? 0) >= 5, "Verify at least 5 skills", "Only skills you actually have.", "/app/profile#verified_skills"],
    [(c?.certs ?? 0) > 0, "Add certifications", "Online courses with credentials count.", "/app/profile#certifications"],
    [(c?.resumes ?? 0) > 0, "Upload or build your first resume", "A one-page DOCX works best.", "/app/resume"],
    [(c?.aptitude ?? 0) >= 3, "Practise aptitude", "Most campus and off-campus tests include it.", "/app/skills?tab=practice&skill=Aptitude"],
    [(c?.mocks ?? 0) > 0, "Do an HR mock interview", "Practise 'Tell me about yourself'.", "/app/interview?mock=hr"],
    [(c?.applied ?? 0) > 0, "Apply to your first roles", "Use Internshala, Apna, NCS and company pages.", "/app/portals?cat=freshers"],
  ];
  const done = steps.filter((s) => s[0]).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Fresher Career Launchpad" description="A path for students and freshers. No full-time work experience needed — education, projects, internships and skills are enough to start." />
      <Card title={`Career readiness: ${done} of ${steps.length} steps`} description="Calculated from what is in your profile and practice history.">
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ul className="divide-y divide-line">
          {steps.map(([ok, title, hint, href]) => (
            <li key={title} className="flex items-center gap-3 py-2.5 text-sm">
              {ok ? <CheckCircle2 className="size-5 text-good" /> : <Circle className="size-5 text-muted" />}
              <span className="flex-1">
                <span className={ok ? "text-ink-2" : "font-medium"}>{title}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <Link href={href} className="btn btn-secondary btn-sm">
                {ok ? "Review" : "Start"}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Where freshers find jobs">
          <ul className="space-y-1.5 text-sm">
            {[
              ["Internshala", "https://internshala.com/"],
              ["National Career Service", "https://www.ncs.gov.in/"],
              ["Apna", "https://apna.co/"],
              ["Naukri (fresher filter)", "https://www.naukri.com/fresher-jobs"],
              ["LinkedIn entry level", "https://www.linkedin.com/jobs/search/?f_E=2"],
            ].map(([n, u]) => (
              <li key={n}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="link">
                  {n}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Off-campus drives are announced on company careers pages; verify any drive that asks for a fee.</p>
        </Card>
        <Card title="Interview foundations">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Tell me about yourself (60–90 seconds)</li>
            <li>Explain your best project end to end</li>
            <li>Why this company and role</li>
            <li>Strengths and an honest weakness</li>
            <li>Basic aptitude and reasoning</li>
          </ul>
          <Link href="/app/interview?tab=guides&guide=hr-round" className="btn btn-secondary btn-sm mt-3">
            HR interview guide
          </Link>
        </Card>
        <Card title="Project ideas to build skills">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Sales or UPI transactions dashboard in Power BI/Excel on public data</li>
            <li>SQL analysis of an open dataset with a written findings report</li>
            <li>Small automation (e.g. Python script that cleans a monthly file)</li>
          </ul>
          <p className="mt-2 text-xs text-muted">Add a project to your profile only when it is actually completed.</p>
        </Card>
      </div>
    </div>
  );
}
