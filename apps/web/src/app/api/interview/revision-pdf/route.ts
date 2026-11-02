import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { buildPrepPlan, prepPlanPdf } from "@careerflow/core";
import { getSessionUser } from "@/lib/session";

/** Quick-revision PDF for Interview Tomorrow mode. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const minutes = Number(sp.get("minutes")) as 15 | 30 | 60 | 120;
  if (![15, 30, 60, 120].includes(minutes)) return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  const appId = sp.get("application");
  const db = await getDatabase();
  const plan = await buildPrepPlan(db, user.id, { applicationId: appId && /^[0-9a-f-]{36}$/i.test(appId) ? appId : null, minutes });
  const pdf = await prepPlanPdf(plan, `Interview revision · ${plan.role ?? "Interview"} · ${minutes} min`);
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="interview-revision-${minutes}min.pdf"`, "cache-control": "no-store" } });
}
