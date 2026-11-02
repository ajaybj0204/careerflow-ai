import { stripHtml } from "@careerflow/shared";

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate: Date;
  from: string;
  fromName: string | null;
  fromEmail: string | null;
  to: string | null;
  subject: string;
  snippet: string;
  /** Plain-text body, used in memory for classification only. Never stored. */
  text: string;
  labelIds: string[];
}

/** The subset of the Gmail API that CareerFlow uses. A fake implementation is used in tests. */
export interface GmailApi {
  getProfile(): Promise<{ emailAddress: string; historyId: string }>;
  listMessages(q: string, pageToken?: string): Promise<{ messages: GmailMessageRef[]; nextPageToken?: string }>;
  getMessage(id: string): Promise<GmailMessage>;
  /** Throws an error with status 404 when startHistoryId is too old. */
  listHistory(startHistoryId: string, pageToken?: string): Promise<{ messageIds: GmailMessageRef[]; historyId: string; nextPageToken?: string }>;
  watch(topicName: string): Promise<{ historyId: string; expiration: Date }>;
  stop(): Promise<void>;
}

export class GmailHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GmailHttpError";
  }
}

function header(headers: { name: string; value: string }[] | undefined, name: string): string | null {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function decodeB64(data?: string): string {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
}

function bodyText(payload: any): string {
  let plain = "";
  let html = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) plain += decodeB64(p.body.data) + "\n";
    else if (p.mimeType === "text/html" && p.body?.data) html += decodeB64(p.body.data) + "\n";
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return (plain.trim() ? plain : stripHtml(html)).slice(0, 20000);
}

export function parseFromHeader(from: string): { name: string | null; email: string | null } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const e = from.match(/[\w.+-]+@[\w.-]+/);
  return { name: null, email: e ? e[0].toLowerCase() : null };
}

export function parseGmailMessage(raw: any): GmailMessage {
  const headers = raw.payload?.headers;
  const from = header(headers, "From") ?? "";
  const { name, email } = parseFromHeader(from);
  return {
    id: raw.id,
    threadId: raw.threadId,
    historyId: raw.historyId,
    internalDate: new Date(Number(raw.internalDate ?? Date.now())),
    from,
    fromName: name,
    fromEmail: email,
    to: header(headers, "To"),
    subject: header(headers, "Subject") ?? "",
    snippet: raw.snippet ?? "",
    text: bodyText(raw.payload),
    labelIds: raw.labelIds ?? [],
  };
}

export function createGmailApi(getAccessToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): GmailApi {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  async function call(path: string, init?: RequestInit) {
    const token = await getAccessToken();
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new GmailHttpError(res.status, `Gmail API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? {} : res.json();
  }
  return {
    async getProfile() {
      const j: any = await call("/profile");
      return { emailAddress: j.emailAddress, historyId: String(j.historyId) };
    },
    async listMessages(q, pageToken) {
      const p = new URLSearchParams({ q, maxResults: "100" });
      if (pageToken) p.set("pageToken", pageToken);
      const j: any = await call(`/messages?${p}`);
      return { messages: j.messages ?? [], nextPageToken: j.nextPageToken };
    },
    async getMessage(id) {
      return parseGmailMessage(await call(`/messages/${encodeURIComponent(id)}?format=full`));
    },
    async listHistory(startHistoryId, pageToken) {
      const p = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", labelId: "INBOX" });
      if (pageToken) p.set("pageToken", pageToken);
      const j: any = await call(`/history?${p}`);
      const ids = new Map<string, GmailMessageRef>();
      for (const h of j.history ?? []) for (const a of h.messagesAdded ?? []) ids.set(a.message.id, { id: a.message.id, threadId: a.message.threadId });
      return { messageIds: [...ids.values()], historyId: String(j.historyId), nextPageToken: j.nextPageToken };
    },
    async watch(topicName) {
      const j: any = await call("/watch", { method: "POST", body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "include" }) });
      return { historyId: String(j.historyId), expiration: new Date(Number(j.expiration)) };
    },
    async stop() {
      await call("/stop", { method: "POST" });
    },
  };
}

/**
 * Gmail search used for imports: only messages that look job-related are fetched, so unrelated
 * personal email is never downloaded or sent to AI.
 */
export function jobSearchQuery(after: Date, before?: Date): string {
  const terms = [
    '"thank you for applying"',
    '"application received"',
    '"your application"',
    '"application for"',
    "interview",
    "assessment",
    '"online test"',
    '"offer letter"',
    "shortlisted",
    '"next steps"',
    '"not moving forward"',
    "unfortunately",
    "recruiter",
    "hiring",
    "candidature",
  ];
  const fmt = (d: Date) => `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `(${terms.join(" OR ")}) after:${fmt(after)}${before ? ` before:${fmt(before)}` : ""} -category:promotions -in:chats`;
}
