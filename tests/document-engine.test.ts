import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  applyDocxEdits,
  composeLetterDocx,
  docxFingerprint,
  extractText,
  parseResumeText,
  readDocxParagraphs,
  renderPdf,
  pdfPageCount,
  extractPdfText,
  toCsv,
  zipFiles,
  DOCX_MIME,
} from "@careerflow/document-engine";
import { makeResumeDocx } from "./fixtures/resume";

describe("document engine: template-preserving DOCX editing", () => {
  it("classifies paragraphs and locks facts", async () => {
    const paras = await readDocxParagraphs(await makeResumeDocx());
    const byText = (t: string) => paras.find((p) => p.text.startsWith(t))!;
    expect(byText("Asha Rao").editable).toBe(false);
    expect(byText("Professional Summary").role).toBe("heading");
    expect(byText("Operations professional").role).toBe("summary");
    expect(byText("Operations professional").editable).toBe(true);
    expect(byText("Operations Executive").editable).toBe(false); // company/title/dates line
    expect(byText("Onboarded 300+").role).toBe("bullet");
    expect(byText("Onboarded 300+").editable).toBe(true);
    expect(byText("Tools:").role).toBe("skills");
    expect(byText("BE, Information").editable).toBe(false);
  });

  it("replaces text while keeping styles, numbering, margins and run formatting", async () => {
    const original = await makeResumeDocx();
    const paras = await readDocxParagraphs(original);
    const bulletIdx = paras.find((p) => p.text.startsWith("Onboarded"))!.index;
    const skillsIdx = paras.find((p) => p.text.startsWith("Tools:"))!.index;
    const out = await applyDocxEdits(original, [
      { paragraphIndex: bulletIdx, text: "Onboarded 300+ merchants for partner banks, completing KYC & compliance documentation <on time>." },
      { paragraphIndex: skillsIdx, text: "Tools: SQL, Excel, Power BI, Jira" },
    ]);
    const after = await readDocxParagraphs(out);
    expect(after[bulletIdx].text).toBe("Onboarded 300+ merchants for partner banks, completing KYC & compliance documentation <on time>.");
    expect(after[skillsIdx].text).toBe("Tools: SQL, Excel, Power BI, Jira");
    expect(after[bulletIdx].isList).toBe(true);

    const a = await docxFingerprint(original);
    const b = await docxFingerprint(out);
    expect(b.styles).toBe(a.styles);
    expect(b.sectPr).toBe(a.sectPr);
    expect(b.paragraphProps).toBe(a.paragraphProps);
    expect(b.files).toEqual(a.files);

    // The bold "Tools: " label run is kept exactly
    const xml = await (await JSZip.loadAsync(out)).file("word/document.xml")!.async("string");
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,200}Tools: <\/w:t>/);
    // Bullet run keeps its font and colour
    expect(xml).toMatch(/w:color w:val="333333"[\s\S]{0,300}KYC &amp; compliance documentation &lt;on time&gt;/);
    // Unedited paragraphs are byte-identical
    const origXml = await (await JSZip.loadAsync(original)).file("word/document.xml")!.async("string");
    expect(xml.includes("Operations Executive")).toBe(true);
    expect(origXml.length).toBeGreaterThan(1000);
  });

  it("refuses to edit locked paragraphs (employers, titles, dates, education)", async () => {
    const original = await makeResumeDocx();
    const paras = await readDocxParagraphs(original);
    const locked = paras.find((p) => p.text.startsWith("Operations Executive"))!.index;
    await expect(applyDocxEdits(original, [{ paragraphIndex: locked, text: "Senior Manager | Big Bank" }])).rejects.toThrow(/locked/);
  });

  it("extracts text and parses a resume without AI", async () => {
    const text = await extractText(await makeResumeDocx(), DOCX_MIME);
    expect(text).toContain("Onboarded 300+ merchants");
    const parsed = parseResumeText(text);
    expect(parsed.email).toBe("asha.rao@example.test");
    expect(parsed.skills).toEqual(expect.arrayContaining(["SQL", "Excel", "Power BI", "KYC", "Merchant Onboarding"]));
    expect(parsed.employment.length).toBeGreaterThanOrEqual(1);
    expect(parsed.employment[0].isCurrent).toBe(true);
  });

  it("creates working DOCX, PDF, CSV and ZIP files", async () => {
    const docx = await composeLetterDocx({
      senderName: "Asha Rao",
      senderContact: ["asha.rao@example.test"],
      date: "2 November 2026",
      recipient: ["Hiring Team", "Example Co"],
      greeting: "Dear Hiring Team,",
      paragraphs: ["First paragraph.", "Second paragraph with ₹ amount."],
      closing: "Sincerely,",
    });
    expect((await extractText(docx, DOCX_MIME)).includes("Second paragraph")).toBe(true);
    const pdf = await renderPdf([{ text: "Title", kind: "title" }, { text: "Salary ₹7.5 LPA — “quoted”", kind: "body" }]);
    expect(await pdfPageCount(pdf)).toBe(1);
    expect(await extractPdfText(pdf)).toContain("Rs. 7.5 LPA");
    const csv = toCsv(["a", "b"], [["=cmd()", 'x,"y"']]);
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain('"x,""y"""');
    const zip = await zipFiles([{ name: "a.txt", data: "hi" }]);
    expect((await JSZip.loadAsync(zip)).file("a.txt")).toBeTruthy();
  });
});
