import JSZip from "jszip";

/**
 * Template-preserving DOCX editing.
 *
 * A tailored resume is the user's own DOCX with the text of selected paragraphs replaced.
 * Everything else (styles, fonts, sizes, margins, columns, tables, headers/footers, bullets, colors)
 * is copied byte-for-byte. Inside an edited paragraph, runs at the start and end whose text is unchanged
 * keep their exact formatting (e.g. a bold "Skills:" label); the changed middle takes the formatting of
 * the first changed run.
 */

export type ParagraphRole = "heading" | "contact" | "summary" | "role_header" | "bullet" | "skills" | "body" | "empty";

export interface DocxParagraph {
  index: number;
  text: string;
  style: string | null;
  isList: boolean;
  section: string | null;
  role: ParagraphRole;
  /** Only summary, bullet, skills and body paragraphs without links/fields can be edited. */
  editable: boolean;
}

interface Range {
  start: number;
  end: number;
}

interface ParagraphLoc extends Range {
  xml: string;
}

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, _n, dec, hex) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : XML_ENTITIES[m.toLowerCase()] ?? m,
  );
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Finds leaf <w:p> elements (paragraphs that do not contain other paragraphs), skipping mc:Fallback copies. */
function findParagraphs(xml: string): ParagraphLoc[] {
  const fallback: Range[] = [];
  const fbRe = /<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g;
  for (let m; (m = fbRe.exec(xml)); ) fallback.push({ start: m.index, end: m.index + m[0].length });
  const inFallback = (pos: number) => fallback.some((r) => pos >= r.start && pos < r.end);

  const tagRe = /<w:p(?=[\s>/])[^>]*?(\/?)>|<\/w:p>/g;
  const stack: { start: number; hasChild: boolean }[] = [];
  const out: ParagraphLoc[] = [];
  for (let m; (m = tagRe.exec(xml)); ) {
    if (m[0] === "</w:p>") {
      const open = stack.pop();
      if (!open) continue;
      if (stack.length) stack[stack.length - 1].hasChild = true;
      const end = m.index + m[0].length;
      if (!open.hasChild && !inFallback(open.start)) out.push({ start: open.start, end, xml: xml.slice(open.start, end) });
    } else if (m[1] === "/") {
      // self-closing empty paragraph
      if (stack.length) stack[stack.length - 1].hasChild = true;
      if (!inFallback(m.index)) out.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
    } else {
      stack.push({ start: m.index, hasChild: false });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

interface RunLoc extends Range {
  xml: string;
  text: string;
}

function runText(runXml: string): string {
  let t = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  for (let m; (m = re.exec(runXml)); ) {
    if (m[0].startsWith("<w:tab")) t += "\t";
    else if (m[0].startsWith("<w:br") || m[0].startsWith("<w:cr")) t += "\n";
    else if (m[1] !== undefined) t += decode(m[1]);
  }
  return t;
}

function findRuns(pXml: string): RunLoc[] {
  const runs: RunLoc[] = [];
  const re = /<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g;
  for (let m; (m = re.exec(pXml)); ) runs.push({ start: m.index, end: m.index + m[0].length, xml: m[0], text: runText(m[0]) });
  return runs;
}

function paragraphText(pXml: string): string {
  return findRuns(pXml)
    .map((r) => r.text)
    .join("");
}

const SECTION_PATTERNS: [string, RegExp][] = [
  ["summary", /^(professional\s+)?(summary|profile|objective|about( me)?|career (summary|objective))$/i],
  ["experience", /^(work\s+|professional\s+)?(experience|employment( history)?|work history|career history)$/i],
  ["education", /^(education|academic(s| background| qualifications)?|qualifications)$/i],
  ["skills", /^((technical|key|core)\s+)?(skills|competencies|expertise|tools( & technologies)?|technical skills)(\s*(&|and)\s*\w+)?$/i],
  ["projects", /^((key|personal|academic)\s+)?projects$/i],
  ["certifications", /^(certifications?|licenses?( & certifications)?|courses|training)$/i],
  ["achievements", /^(achievements|awards|accomplishments|honou?rs)$/i],
];

function detectSection(text: string, style: string | null): string | null {
  const t = text.trim().replace(/[:|]+$/, "").trim();
  if (!t || t.length > 40) return null;
  for (const [name, re] of SECTION_PATTERNS) if (re.test(t)) return name;
  if (style && /heading/i.test(style) && t.length < 40) return "other:" + t.toLowerCase();
  return null;
}

const DATE_RE = /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(19|20)?\d{2}\b|\bpresent\b|\bcurrent\b/i;

function classify(p: { text: string; style: string | null; isList: boolean; hasLink: boolean }, section: string | null, isFirstParas: boolean): { role: ParagraphRole; editable: boolean } {
  const t = p.text.trim();
  if (!t) return { role: "empty", editable: false };
  if (detectSection(t, p.style)) return { role: "heading", editable: false };
  if (isFirstParas && (/@|\+?\d[\d\s-]{8,}|linkedin|github|https?:/i.test(t) || !section)) return { role: "contact", editable: false };
  const bulletChar = /^[•●▪◦‣\-–*]\s/.test(t);
  if (section === "skills") return { role: "skills", editable: !p.hasLink };
  if (section === "summary") return { role: "summary", editable: !p.hasLink };
  if (p.isList || bulletChar) {
    // bullets under experience/projects/achievements can be reworded; education/certification bullets stay as written
    const ok = section === "experience" || section === "projects" || section === "achievements" || section === null || section.startsWith("other:");
    return { role: "bullet", editable: ok && !p.hasLink };
  }
  if (section === "experience" || section === "education" || section === "projects" || section === "certifications") {
    // company / title / date lines and education entries are facts: never edited
    if (DATE_RE.test(t) || t.length < 90) return { role: "role_header", editable: false };
    return { role: "body", editable: section === "experience" || section === "projects" };
  }
  return { role: "body", editable: false };
}

export async function loadDocx(buf: Buffer | Uint8Array) {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("This file is not a valid DOCX document (word/document.xml is missing).");
  const xml = await file.async("string");
  return { zip, xml };
}

/** Lists paragraphs with roles and whether each may be edited. */
export async function readDocxParagraphs(buf: Buffer | Uint8Array): Promise<DocxParagraph[]> {
  const { xml } = await loadDocx(buf);
  const locs = findParagraphs(xml);
  let section: string | null = null;
  let seenText = 0;
  return locs.map((loc, index) => {
    const text = paragraphText(loc.xml);
    const style = loc.xml.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1] ?? null;
    const isList = /<w:numPr>/.test(loc.xml) || /list/i.test(style ?? "");
    const hasLink = /<w:hyperlink\b|<w:fldSimple\b|<w:instrText\b/.test(loc.xml);
    const sec = detectSection(text, style);
    if (sec) section = sec;
    if (text.trim()) seenText++;
    const { role, editable } = classify({ text, style, isList, hasLink }, sec ? sec : section, seenText <= 3 && !section);
    return { index, text, style, isList, section: sec ?? section, role, editable };
  });
}

function replaceRunText(runXml: string, text: string): string {
  // Remove existing text/tab/break nodes, then add one text node after the run properties.
  let body = runXml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t\s*\/>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g, "");
  if (!text) return body;
  const node = `<w:t xml:space="preserve">${encode(text)}</w:t>`;
  if (/<\/w:rPr>/.test(body)) return body.replace(/<\/w:rPr>/, `</w:rPr>${node}`);
  return body.replace(/^(<w:r(?=[\s>])[^>]*>)/, `$1${node}`);
}

/** Replaces the text of one paragraph while keeping its formatting. */
export function replaceParagraphText(pXml: string, newText: string): string {
  const runs = findRuns(pXml);
  if (!runs.length) {
    // Paragraph had no runs: insert a run using the paragraph's run properties (if any)
    const rPr = pXml.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/)?.[1] ?? "";
    return pXml.replace(/<\/w:p>$/, `<w:r>${rPr}<w:t xml:space="preserve">${encode(newText)}</w:t></w:r></w:p>`);
  }
  // Keep whole runs at the start/end whose text is unchanged.
  let pre = 0;
  let preChars = 0;
  while (pre < runs.length && newText.startsWith(runs.slice(0, pre + 1).map((r) => r.text).join("")) && runs[pre].text) {
    preChars += runs[pre].text.length;
    pre++;
  }
  let suf = 0;
  let sufChars = 0;
  while (
    suf < runs.length - pre &&
    runs[runs.length - 1 - suf].text &&
    newText.length - preChars - sufChars - runs[runs.length - 1 - suf].text.length >= 0 &&
    newText.endsWith(runs.slice(runs.length - 1 - suf).map((r) => r.text).join(""))
  ) {
    sufChars += runs[runs.length - 1 - suf].text.length;
    suf++;
  }
  const middle = newText.slice(preChars, newText.length - sufChars);
  const middleRuns = runs.slice(pre, runs.length - suf);
  let out = pXml;
  // Edit from the end so earlier offsets stay valid.
  if (!middleRuns.length) {
    if (!middle) return pXml;
    // All runs kept: append middle text to the last kept prefix run (or first run)
    const target = runs[Math.max(0, pre - 1)];
    const replaced = replaceRunText(target.xml, target.text + middle);
    return out.slice(0, target.start) + replaced + out.slice(target.end);
  }
  for (let i = middleRuns.length - 1; i >= 0; i--) {
    const r = middleRuns[i];
    const replaced = replaceRunText(r.xml, i === 0 ? middle : "");
    out = out.slice(0, r.start) + replaced + out.slice(r.end);
  }
  return out;
}

export interface ParagraphEdit {
  paragraphIndex: number;
  text: string;
}

/** Applies paragraph edits and returns a new DOCX. Edits to non-editable paragraphs are refused. */
export async function applyDocxEdits(buf: Buffer | Uint8Array, edits: ParagraphEdit[], opts: { allowLocked?: boolean } = {}): Promise<Buffer> {
  const { zip, xml } = await loadDocx(buf);
  const paras = await readDocxParagraphs(buf);
  const locs = findParagraphs(xml);
  const byIndex = new Map(edits.map((e) => [e.paragraphIndex, e.text]));
  let out = xml;
  for (let i = locs.length - 1; i >= 0; i--) {
    if (!byIndex.has(i)) continue;
    const p = paras[i];
    if (!p.editable && !opts.allowLocked) throw new Error(`Paragraph ${i} (${p.role}) is locked and cannot be edited.`);
    const newText = byIndex.get(i)!.replace(/\r?\n/g, " ").trim();
    out = out.slice(0, locs[i].start) + replaceParagraphText(locs[i].xml, newText) + out.slice(locs[i].end);
  }
  zip.file("word/document.xml", out);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Quick structural fingerprint used to confirm the template was preserved. */
export async function docxFingerprint(buf: Buffer | Uint8Array) {
  const { zip, xml } = await loadDocx(buf);
  const styles = (await zip.file("word/styles.xml")?.async("string")) ?? "";
  const sectPr = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)?.join("") ?? "";
  const pPrs = (xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) ?? []).length;
  const files = Object.keys(zip.files).filter((f) => !f.endsWith("/")).sort();
  return { styles, sectPr, paragraphProps: pPrs, files };
}
