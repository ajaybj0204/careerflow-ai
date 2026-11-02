import { redirect } from "next/navigation";
import { getDatabase } from "@careerflow/database";
import { AppShell } from "@/components/shell";
import { authMode } from "@/lib/config";
import { requireUser, signOutSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDatabase();
  const info = await db.withUser(user.id, async (tx) => ({
    profile: await tx.one<{ full_name: string | null }>("select full_name from profiles limit 1"),
    unread: (await tx.one<{ n: number }>("select count(*)::int as n from notifications where read_at is null"))?.n ?? 0,
    review: (await tx.one<{ n: number }>("select count(*)::int as n from review_queue where status = 'open'"))?.n ?? 0,
  }));
  async function signOut() {
    "use server";
    await signOutSession();
    redirect("/login");
  }
  const banner =
    authMode() === "local" ? (
      <div className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
        Local test mode: data is stored on this computer and sign-in is a development login. Configure Supabase for real accounts.
      </div>
    ) : null;
  return (
    <AppShell user={{ email: user.email, name: info.profile?.full_name ?? null }} counts={{ "/app/notifications": info.unread, "/app/review": info.review }} signOut={signOut} banner={banner}>
      {children}
    </AppShell>
  );
}
