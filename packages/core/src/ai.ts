import { getAIProvider, requireAIProvider, type AIProvider } from "@careerflow/ai";
import type { Database } from "@careerflow/database";

/** AI provider for a user, with metadata-only audit logging (no prompt or output content is stored). */
export function aiFor(db: Database, userId: string | null): AIProvider | null {
  return getAIProvider(async (e) => {
    await db.asService((tx) =>
      tx.query(
        "insert into ai_audit_logs (user_id, feature, provider, model, input_chars, output_chars, status, error) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [userId, e.feature, e.provider, e.model, e.inputChars, e.outputChars, e.status, e.error?.slice(0, 300) ?? null],
      ),
    );
  });
}

export function requireAI(db: Database, userId: string | null): AIProvider {
  const p = aiFor(db, userId);
  return p ?? requireAIProvider();
}
