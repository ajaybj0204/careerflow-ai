import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { exportAccountData } from "@careerflow/core";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`export:${user.id}`, 3, 60_000).ok) return NextResponse.json({ error: "Please wait a minute before exporting again." }, { status: 429 });
  const zip = await exportAccountData(await getDatabase(), user.id);
  return new NextResponse(new Uint8Array(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="careerflow-export-${new Date().toISOString().slice(0, 10)}.zip"`, "cache-control": "no-store" },
  });
}
