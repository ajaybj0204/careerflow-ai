import { z } from "zod";
import {
  AIOutputError,
  BASE_RULES,
  type AIProvider,
  type AuditEntry,
  type GenerateJsonRequest,
  type GenerateJsonResult,
  type Source,
} from "./provider";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  constructor(
    private apiKey: string,
    readonly model: string = "gemini-2.5-flash",
    private onAudit?: (e: AuditEntry) => void | Promise<void>,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    const schemaJson = jsonSchemaFor(req.schema);
    const inputChars = req.system.length + req.prompt.length;
    let lastError = "";
    // Attempt 1: native structured output. Attempt 2: retry with the validation error.
    // Grounded requests cannot use structured output, so the schema is put in the prompt instead.
    for (let attempt = 0; attempt < 2; attempt++) {
      const promptText =
        req.prompt +
        (req.grounding ? `\n\nReturn only JSON matching this JSON Schema:\n${JSON.stringify(schemaJson)}` : "") +
        (lastError ? `\n\nYour previous response was invalid: ${lastError}. Return corrected JSON only.` : "");
      const parts: any[] = [{ text: promptText }];
      for (const img of req.images ?? []) parts.push({ inline_data: { mime_type: img.mimeType, data: img.dataBase64 } });
      const body: any = {
        systemInstruction: { parts: [{ text: `${BASE_RULES}\n\n${req.system}` }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: req.temperature ?? 0.3 },
      };
      if (req.grounding) body.tools = [{ google_search: {} }];
      else {
        body.generationConfig.responseMimeType = "application/json";
        body.generationConfig.responseJsonSchema = schemaJson;
      }

      let res: Response;
      try {
        res = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
      } catch (e) {
        await this.audit(req, inputChars, 0, "error", String(e));
        throw new Error("Could not reach the AI service. Please try again.");
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        await this.audit(req, inputChars, 0, "error", `HTTP ${res.status}`);
        if (res.status === 429) throw new Error("The AI service is rate-limited right now. Please wait a minute and retry.");
        if (res.status === 400 && /API key/i.test(detail)) throw new Error("The Gemini API key was rejected. Check GEMINI_API_KEY.");
        throw new Error(`AI request failed (HTTP ${res.status}).`);
      }
      const json: any = await res.json();
      const cand = json.candidates?.[0];
      const text: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      if (!text) {
        lastError = `empty response (finishReason ${cand?.finishReason ?? "unknown"})`;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(text));
      } catch {
        lastError = "response was not valid JSON";
        continue;
      }
      const result = req.schema.safeParse(parsed);
      if (!result.success) {
        lastError = result.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        continue;
      }
      const sources: Source[] = (cand?.groundingMetadata?.groundingChunks ?? [])
        .map((c: any) => c.web)
        .filter((w: any) => w?.uri)
        .map((w: any) => ({ title: w.title ?? w.uri, url: w.uri }));
      await this.audit(req, inputChars, text.length, "ok");
      return { data: result.data, sources, model: this.model };
    }
    await this.audit(req, inputChars, 0, "invalid_output", lastError);
    throw new AIOutputError("The AI returned an answer in an unexpected format. Nothing was saved. Please try again.");
  }

  private async audit(req: GenerateJsonRequest<unknown>, inputChars: number, outputChars: number, status: AuditEntry["status"], error?: string) {
    try {
      await this.onAudit?.({ userId: req.userId, feature: req.feature, provider: this.name, model: this.model, inputChars, outputChars, status, error });
    } catch {
      /* audit failures never break the request */
    }
  }
}
