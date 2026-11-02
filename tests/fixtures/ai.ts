import type { AIProvider, GenerateJsonRequest, GenerateJsonResult } from "@careerflow/ai";
import { AIOutputError } from "@careerflow/ai";

/** Deterministic fake provider. Responses are still validated against each feature's schema. */
export class FakeAI implements AIProvider {
  readonly name = "fake";
  readonly model = "fake-1";
  calls: { feature: string; prompt: string; system: string }[] = [];
  constructor(private responders: Record<string, (req: GenerateJsonRequest<any>) => unknown>) {}
  async generateJson<T>(req: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
    this.calls.push({ feature: req.feature, prompt: req.prompt, system: req.system });
    const responder = this.responders[req.feature];
    if (!responder) throw new Error(`FakeAI has no response for ${req.feature}`);
    const parsed = req.schema.safeParse(responder(req));
    if (!parsed.success) throw new AIOutputError("invalid output");
    return { data: parsed.data, sources: [], model: this.model };
  }
}
