import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { EXPORT_HEADERS, exportRows, listApplications } from "@careerflow/core";
import { toCsv, toXlsx } from "@careerflow/document-engine";
import { getSessionUser } from "@/lib/session";

/** Exports the user's applications (respecting the current filters) as CSV or Excel. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const db = await getDatabase();
  const apps = await db.withUser(user.id, (tx) =>
    listApplications(tx, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, portal: sp.get("portal") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, archived: sp.get("archived") === "1" }),
  );
  const rows = exportRows(apps);
  const stamp = new Date().toISOString().slice(0, 10);
  if (sp.get("format") === "xlsx") {
    const buf = await toXlsx("Applications", EXPORT_HEADERS, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="careerflow-applications-${stamp}.xlsx"`, "cache-control": "no-store" },
    });
  }
  return new NextResponse(toCsv(EXPORT_HEADERS, rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="careerflow-applications-${stamp}.csv"`, "cache-control": "no-store" } });
}
