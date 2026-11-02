import Link from "next/link";
import { ResultPanel } from "@/components/forms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { withUser } from "@/lib/session";
import { linkedinAction } from "../_actions/ai";

export const metadata = { title: "LinkedIn & Portfolio" };

export default async function LinkedIn() {
  const d = await withUser(async (tx) => ({
    projects: await tx.query("select name, description, tech, url, repo_url from portfolio_projects where verified and status = 'completed' order by created_at desc"),
    cp: await tx.one("select linkedin_url, github_url, portfolio_url from career_profiles limit 1"),
  }));
  return (
    <div className="space-y-6">
      <PageHeader title="LinkedIn & Portfolio Optimization" description="Copy-ready headline, About section, experience descriptions and project write-ups from your verified profile. CareerFlow never changes your LinkedIn, GitHub or portfolio." />
      <Card title="Profile suggestions">
        <ResultPanel action={linkedinAction} kind="linkedin" submitLabel="Generate suggestions" pendingText="Writing…">
          <p className="text-sm text-ink-2">Uses only verified facts. Review everything before posting.</p>
        </ResultPanel>
      </Card>
      <Card title="GitHub README starters" description="For your completed, verified projects.">
        {d.projects.length ? (
          <div className="space-y-4">
            {d.projects.map((p: any) => {
              const md = `# ${p.name}\n\n${p.description ?? "One-line description of what it does."}\n\n## Tech\n${(p.tech ?? []).map((t: string) => `- ${t}`).join("\n") || "- …"}\n\n## Features\n- …\n\n## Run locally\n\`\`\`bash\n# steps\n\`\`\`\n${p.url ? `\n## Live\n${p.url}\n` : ""}`;
              return (
                <div key={p.name}>
                  <p className="mb-1 text-sm font-medium">{p.name}</p>
                  <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{md}</pre>
                </div>
              );
            })}
          </div>
        ) : (
          <Notice tone="info">
            Add completed projects in <Link href="/app/profile#portfolio_projects" className="link">My Career Profile</Link> to get README starters.
          </Notice>
        )}
      </Card>
      <Card title="Your links">
        <ul className="space-y-1 text-sm">
          {[
            ["LinkedIn", d.cp?.linkedin_url],
            ["GitHub", d.cp?.github_url],
            ["Portfolio", d.cp?.portfolio_url],
          ].map(([k, v]) => (
            <li key={k}>
              {k}:{" "}
              {v ? (
                <a href={v} target="_blank" rel="noopener noreferrer" className="link">
                  {v}
                </a>
              ) : (
                <span className="text-muted">not set</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
