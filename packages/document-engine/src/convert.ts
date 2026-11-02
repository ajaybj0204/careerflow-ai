import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.SOFFICE_PATH,
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
].filter(Boolean) as string[];

export function findSoffice(): string | null {
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

/**
 * Exact DOCX -> PDF conversion using LibreOffice (keeps the template's layout).
 * Returns null when LibreOffice is not installed; callers then fall back to the simplified renderer
 * and tell the user the PDF is a simplified layout.
 */
export async function convertDocxToPdf(docx: Buffer): Promise<Buffer | null> {
  const soffice = findSoffice();
  if (!soffice) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-convert-"));
  const input = path.join(dir, "document.docx");
  fs.writeFileSync(input, docx);
  try {
    await new Promise<void>((resolve, reject) =>
      execFile(
        soffice,
        ["--headless", "--norestore", `-env:UserInstallation=file:///${dir.replace(/\\/g, "/")}/profile`, "--convert-to", "pdf", "--outdir", dir, input],
        { timeout: 60_000 },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
    const out = path.join(dir, "document.pdf");
    return fs.existsSync(out) ? fs.readFileSync(out) : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
