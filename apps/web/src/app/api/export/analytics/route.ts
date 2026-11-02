import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { computeMetrics } from "@careerflow/core";
import { renderPdf, toCsv, type PdfBlock } from "@careerflow/document-engine";
import { getSessionUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const range = { from: sp.get("from") || null, to: sp.get("to") || null };
  const m = await (await getDatabase()).withUser(user.id, (tx) => computeMetrics(tx, range));
  const rows: [string, string | number | null][] = [
    ["Range", `${range.from ?? "all time"} to ${range.to ?? "today"}`],
    ["Applications submitted", m.submitted],
    ["Saved (not applied)", m.saved],
    ["Responses", m.responded],
    ["Response rate %", m.responseRate],
    ["Interviews", m.interviews],
    ["Interview conversion %", m.interviewRate],
    ["Offers", m.offers],
    ["Offer conversion %", m.offerRate],
    ["Rejections", m.rejections],
    ["Average days to first response", m.avgResponseDays],
    ...m.byPlatform.map((p) => [`Platform: ${p.key}`, `${p.submitted} applied / ${p.responded} responses / ${p.interviews} interviews`] as [string, string]),
    ...m.byRole.map((p) => [`Role: ${p.key}`, `${p.submitted} applied / ${p.responded} responses / ${p.interviews} interviews`] as [string, string]),
  ];
  if (sp.get("format") === "pdf") {
    const blocks: PdfBlock[] = [{ text: "CareerFlow AI · Job search analytics", kind: "title" }, ...rows.map(([k, v]) => ({ text: `${k}: ${v ?? "—"}` })), { text: "Definitions", kind: "heading" }, ...Object.entries(m.definitions).map(([k, v]) => ({ text: `${k}: ${v}`, kind: "bullet" as const }))];
    const pdf = await renderPdf(blocks, { title: "Job search analytics", footer: `Generated ${new Date().toLocaleString("en-IN")}` });
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="careerflow-analytics.pdf"', "cache-control": "no-store" } });
  }
  return new NextResponse(toCsv(["Metric", "Value"], rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="careerflow-analytics.csv"', "cache-control": "no-store" } });
}
