import { GmailHttpError, type GmailApi, type GmailMessage } from "@careerflow/gmail";

/** Fictional emails. No real private messages are used in tests. */
let n = 0;
export function mail(p: Partial<GmailMessage> & { subject: string; text: string; from: string }): GmailMessage {
  n++;
  const m = p.from.match(/^(.*?)\s*<(.+)>$/);
  return {
    id: p.id ?? `msg-${n}`,
    threadId: p.threadId ?? `thread-${n}`,
    internalDate: p.internalDate ?? new Date(Date.now() - (100 - n) * 60_000),
    from: p.from,
    fromName: m ? m[1].replace(/"/g, "") : null,
    fromEmail: (m ? m[2] : p.from).toLowerCase(),
    to: "candidate@example.test",
    subject: p.subject,
    snippet: p.text.slice(0, 120),
    text: p.text,
    labelIds: ["INBOX"],
  };
}

export class FakeGmail implements GmailApi {
  messages: GmailMessage[] = [];
  historyId = 1000;
  historyExpired = false;
  pending: string[] = [];
  watched = false;
  stopped = false;

  add(...ms: GmailMessage[]) {
    for (const m of ms) {
      this.messages.push(m);
      this.pending.push(m.id);
      this.historyId++;
    }
  }
  async getProfile() {
    return { emailAddress: "candidate@example.test", historyId: String(this.historyId) };
  }
  async listMessages(_q: string, pageToken?: string) {
    const start = pageToken ? Number(pageToken) : 0;
    const page = this.messages.slice(start, start + 2);
    const next = start + 2 < this.messages.length ? String(start + 2) : undefined;
    return { messages: page.map((m) => ({ id: m.id, threadId: m.threadId })), nextPageToken: next };
  }
  async getMessage(id: string) {
    const m = this.messages.find((x) => x.id === id);
    if (!m) throw new GmailHttpError(404, "not found");
    return m;
  }
  async listHistory() {
    if (this.historyExpired) throw new GmailHttpError(404, "history too old");
    const ids = this.pending.splice(0).map((id) => ({ id, threadId: this.messages.find((m) => m.id === id)!.threadId }));
    return { messageIds: ids, historyId: String(this.historyId) };
  }
  async watch() {
    this.watched = true;
    return { historyId: String(this.historyId), expiration: new Date(Date.now() + 7 * 864e5) };
  }
  async stop() {
    this.stopped = true;
  }
}
