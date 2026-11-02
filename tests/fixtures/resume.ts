import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";

/** A fictional resume (no real personal data) with mixed formatting, bullets and headings. */
export async function makeResumeDocx(): Promise<Buffer> {
  const bullet = (text: string) =>
    new Paragraph({ numbering: { reference: "b", level: 0 }, children: [new TextRun({ text, font: "Georgia", size: 21, color: "333333" })] });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Georgia", size: 21 } } } },
    numbering: {
      config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT }] }],
    },
    sections: [
      {
        properties: { page: { margin: { top: 700, bottom: 700, left: 900, right: 900 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Asha Rao", bold: true, size: 36 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "asha.rao@example.test | +91 90000 00000 | Bengaluru" })] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Professional Summary")] }),
          new Paragraph({ children: [new TextRun("Operations professional with 2 years in payments, handling merchant onboarding and KYC checks.")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Experience")] }),
          new Paragraph({ children: [new TextRun({ text: "Operations Executive | Example Payments Pvt Ltd", bold: true }), new TextRun("\tJan 2023 – Present")] }),
          bullet("Onboarded 300+ merchants for partner banks with complete KYC documentation."),
          bullet("Managed MID/TID creation and device mapping for POS terminals."),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Skills")] }),
          new Paragraph({ children: [new TextRun({ text: "Tools: ", bold: true }), new TextRun("Excel, SQL, Power BI, Jira")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Education")] }),
          new Paragraph({ children: [new TextRun("BE, Information Science – Example Institute of Technology, 2022")] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
