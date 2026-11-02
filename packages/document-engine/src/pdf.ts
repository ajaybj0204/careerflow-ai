import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/** Extracts plain text from a PDF. */
export async function extractPdfText(buf: Buffer | Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function pdfPageCount(buf: Buffer | Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

// The standard PDF fonts only cover WinAnsi characters.
const REPLACEMENTS: [RegExp, string][] = [
  [/₹/g, "Rs. "],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/[●▪◦‣]/g, "•"],
  [/\t/g, "    "],
  [/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…€]/g, ""],
];
export function pdfSafe(s: string): string {
  return REPLACEMENTS.reduce((acc, [re, r]) => acc.replace(re, r), s);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface PdfBlock {
  text: string;
  kind?: "title" | "heading" | "subheading" | "body" | "bullet" | "small" | "spacer";
}

/**
 * Renders blocks into a clean A4 PDF. Used for cover letters, reports, revision sheets and, when
 * LibreOffice is not installed, a simplified-layout copy of a resume (clearly labelled in the UI).
 */
export async function renderPdf(blocks: PdfBlock[], opts: { title?: string; footer?: string } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(pdfSafe(opts.title));
  doc.setProducer("CareerFlow AI");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 54;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.38, 0.38, 0.42);

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };

  for (const b of blocks) {
    const kind = b.kind ?? "body";
    if (kind === "spacer") {
      y -= 8;
      continue;
    }
    const size = kind === "title" ? 18 : kind === "heading" ? 12.5 : kind === "subheading" ? 11 : kind === "small" ? 8.5 : 10.5;
    const font = kind === "title" || kind === "heading" || kind === "subheading" ? bold : regular;
    const indent = kind === "bullet" ? 14 : 0;
    const text = pdfSafe(b.text);
    const lines = wrap(text, font, size, W - 2 * M - indent);
    const lh = size * 1.35;
    if (kind === "heading") y -= 6;
    for (let i = 0; i < lines.length; i++) {
      if (y - lh < M) newPage();
      if (kind === "bullet" && i === 0) page.drawText("•", { x: M + 3, y: y - size, size, font: regular, color: ink });
      page.drawText(lines[i], { x: M + indent, y: y - size, size, font, color: kind === "small" ? muted : ink });
      y -= lh;
    }
    if (kind === "heading") {
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.82) });
      y -= 4;
    }
    y -= kind === "title" ? 6 : 3;
  }
  if (opts.footer) {
    for (const p of doc.getPages()) p.drawText(pdfSafe(opts.footer), { x: M, y: 28, size: 7.5, font: regular, color: muted });
  }
  return Buffer.from(await doc.save());
}
