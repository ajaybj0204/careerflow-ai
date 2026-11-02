import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";

export interface LetterInput {
  senderName: string;
  senderContact: string[];
  date: string;
  recipient: string[];
  greeting: string;
  paragraphs: string[];
  closing: string;
}

const FONT = "Calibri";

/** Cover letter as an editable DOCX. */
export async function composeLetterDocx(l: LetterInput): Promise<Buffer> {
  const p = (text: string, opts: { bold?: boolean; size?: number; after?: number } = {}) =>
    new Paragraph({ spacing: { after: opts.after ?? 120 }, children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: FONT })] });
  const doc = new Document({
    creator: "CareerFlow AI",
    title: `Cover letter - ${l.senderName}`,
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children: [
          p(l.senderName, { bold: true, size: 30, after: 40 }),
          ...l.senderContact.map((c) => p(c, { size: 20, after: 0 })),
          p("", { after: 200 }),
          p(l.date),
          ...l.recipient.map((r) => p(r, { after: 0 })),
          p("", { after: 120 }),
          p(l.greeting, { after: 200 }),
          ...l.paragraphs.map((t) => p(t, { after: 200 })),
          p(l.closing, { after: 40 }),
          p(l.senderName, { bold: true }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export interface ResumeSection {
  heading: string;
  entries: { title?: string; subtitle?: string; right?: string; bullets?: string[]; text?: string }[];
}

/**
 * Builds a clean, editable DOCX resume template from parsed content.
 * Used only for PDF-only uploads ("reconstructed template"), which the user must review and approve.
 */
export async function composeResumeDocx(input: { name: string; contact: string; sections: ResumeSection[] }): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: input.name, bold: true, size: 34, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: input.contact, size: 19, font: FONT })] }),
  ];
  for (const s of input.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 160, after: 80 },
        border: { bottom: { color: "999999", style: BorderStyle.SINGLE, size: 4, space: 2 } },
        children: [new TextRun({ text: s.heading.toUpperCase(), bold: true, size: 22, font: FONT, color: "222222" })],
      }),
    );
    for (const e of s.entries) {
      if (e.title) {
        children.push(
          new Paragraph({
            spacing: { after: 20 },
            tabStops: [{ type: "right", position: 10000 }],
            children: [
              new TextRun({ text: e.title, bold: true, size: 21, font: FONT }),
              ...(e.right ? [new TextRun({ text: `\t${e.right}`, size: 20, font: FONT })] : []),
            ],
          }),
        );
      }
      if (e.subtitle) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: e.subtitle, italics: true, size: 20, font: FONT })] }));
      if (e.text) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: e.text, size: 20, font: FONT })] }));
      for (const b of e.bullets ?? [])
        children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: b, size: 20, font: FONT })] }));
    }
  }
  const doc = new Document({
    creator: "CareerFlow AI",
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 860, right: 860 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

/** Simple DOCX from headed sections (match reports, revision notes). */
export async function composeReportDocx(title: string, blocks: { heading?: string; lines: string[] }[]): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: FONT })] })];
  for (const b of blocks) {
    if (b.heading) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: b.heading, font: FONT })] }));
    for (const l of b.lines) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: l, font: FONT, size: 21 })] }));
  }
  return Packer.toBuffer(new Document({ creator: "CareerFlow AI", sections: [{ children }] }));
}

export async function zipFiles(files: { name: string; data: Buffer | Uint8Array | string }[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
