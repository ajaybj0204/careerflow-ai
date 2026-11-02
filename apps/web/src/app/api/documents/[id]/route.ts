import { NextResponse } from "next/server";
import { getDatabase } from "@careerflow/database";
import { readDocument } from "@careerflow/core";
import { getSessionUser } from "@/lib/session";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]);

/** Downloads a private document. Row Level Security guarantees users can only fetch their own files. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await getDatabase();
  try {
    const { doc, data } = await db.withUser(user.id, (tx) => readDocument(tx, id));
    const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE.has(doc.mime_type);
    const name = doc.title.replace(/[^\w.\- ()]+/g, "_");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": doc.mime_type,
        "content-length": String(data.length),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
