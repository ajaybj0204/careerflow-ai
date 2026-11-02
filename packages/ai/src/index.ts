import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "./gemini";
import { AINotConfiguredError, type AIProvider, type AuditEntry } from "./provider";

export * from "./provider";
export { GeminiProvider } from "./gemini";

let override: AIProvider | null | undefined;

/** Tests can inject a provider. Pass undefined to restore environment-based selection. */
export function setAIProviderOverride(p: AIProvider | null | undefined) {
  override = p;
}

/**
 * Returns the configured AI provider, or null when no key is set.
 * Business logic depends only on the AIProvider interface, so other providers can be added here.
 */
export function getAIProvider(onAudit?: (e: AuditEntry) => void | Promise<void>): AIProvider | null {
  if (override !== undefined) return override;
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return new GeminiProvider(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, onAudit, fetch, (process.env.GEMINI_FALLBACK_MODELS ? process.env.GEMINI_FALLBACK_MODELS.split(",").map((s) => s.trim()) : undefined));
  }
  return null;
}

export function requireAIProvider(onAudit?: (e: AuditEntry) => void | Promise<void>): AIProvider {
  const p = getAIProvider(onAudit);
  if (!p) throw new AINotConfiguredError();
  return p;
}

export function isAIConfigured(): boolean {
  return getAIProvider() !== null;
}
