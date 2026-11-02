export * from "./docx";
export * from "./pdf";
export * from "./convert";
export * from "./compose";
export * from "./export";
export * from "./resume-parse";

/** Plain text from an uploaded resume or document. */
export async function extractText(buf: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const { extractPdfText } = await import("./pdf");
    return extractPdfText(buf);
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (mime.startsWith("text/")) return buf.toString("utf8");
  throw new Error("Unsupported file type for text extraction.");
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";
export const DOC_MIME = "application/msword";
