import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, type Tx } from "@careerflow/database";

/**
 * Private file storage. Production: Supabase Storage bucket "career-documents" (private, per-user folders),
 * accessed only from the server with the service key. Local development: files under <repo>/.data/storage.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  readonly kind: "local" | "supabase";
}

class LocalStorage implements StorageAdapter {
  readonly kind = "local" as const;
  constructor(private root: string) {}
  private file(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
  async get(key: string) {
    return fs.readFileSync(this.file(key));
  }
  async remove(key: string) {
    fs.rmSync(this.file(key), { force: true });
  }
}

class SupabaseStorage implements StorageAdapter {
  readonly kind = "supabase" as const;
  constructor(private url: string, private serviceKey: string, private bucket = "career-documents") {}
  private endpoint(key: string) {
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  private headers(extra: Record<string, string> = {}) {
    return { authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.endpoint(key), { method: "POST", headers: this.headers({ "content-type": contentType, "x-upsert": "true" }), body: new Uint8Array(data) });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status})`);
  }
  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: this.headers() });
    if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    await fetch(`${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}`, {
      method: "DELETE",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
}

let storage: StorageAdapter | null = null;
export function getStorage(): StorageAdapter {
  if (storage) return storage;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  storage = url && key ? new SupabaseStorage(url, key) : new LocalStorage(process.env.CAREERFLOW_STORAGE_DIR ?? path.join(findRepoRoot(), ".data", "storage"));
  return storage;
}
export function setStorage(s: StorageAdapter) {
  storage = s;
}
export function memoryStorage(): StorageAdapter {
  const m = new Map<string, Buffer>();
  return {
    kind: "local",
    put: async (k, d) => void m.set(k, d),
    get: async (k) => {
      const v = m.get(k);
      if (!v) throw new Error("not found");
      return v;
    },
    remove: async (k) => void m.delete(k),
  };
}

export const ALLOWED_UPLOADS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Checks size, declared type, extension and file signature (magic bytes). */
export function validateUpload(name: string, mime: string, data: Buffer): string | null {
  if (data.length === 0) return "The file is empty.";
  if (data.length > MAX_UPLOAD_BYTES) return "Files must be 10 MB or smaller.";
  const exts = ALLOWED_UPLOADS[mime];
  if (!exts) return "This file type is not supported.";
  if (!exts.some((e) => name.toLowerCase().endsWith(e))) return "The file extension does not match its type.";
  const sig = data.subarray(0, 8);
  const ok =
    (mime === "application/pdf" && sig.subarray(0, 5).toString() === "%PDF-") ||
    (mime.includes("openxmlformats") && sig[0] === 0x50 && sig[1] === 0x4b) ||
    (mime === "application/msword" && sig[0] === 0xd0 && sig[1] === 0xcf) ||
    (mime === "image/png" && sig[0] === 0x89 && sig[1] === 0x50) ||
    (mime === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) ||
    (mime === "image/webp" && data.subarray(8, 12).toString() === "WEBP") ||
    mime === "text/plain";
  return ok ? null : "The file content does not match its type.";
}

export interface StoredDocument {
  id: string;
  title: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  version: number;
  application_id: string | null;
  created_at: string;
}

/** Saves a file to private storage and records it. Runs inside the user's transaction. */
export async function saveDocument(
  tx: Tx,
  userId: string,
  input: { kind: string; title: string; fileName: string; mime: string; data: Buffer; applicationId?: string | null; parentId?: string | null; sensitive?: boolean },
): Promise<StoredDocument> {
  const id = crypto.randomUUID();
  const safeName = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const key = `${userId}/${id}/${safeName}`;
  await getStorage().put(key, input.data, input.mime);
  let version = 1;
  if (input.parentId) {
    const parent = await tx.one<{ version: number }>("select version from documents where id = $1", [input.parentId]);
    version = (parent?.version ?? 0) + 1;
  }
  const row = await tx.one<StoredDocument>(
    `insert into documents (id, user_id, kind, title, storage_path, mime_type, size_bytes, sha256, version, parent_document_id, application_id, sensitive)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [
      id,
      userId,
      input.kind,
      input.title.slice(0, 200),
      key,
      input.mime,
      input.data.length,
      crypto.createHash("sha256").update(input.data).digest("hex"),
      version,
      input.parentId ?? null,
      input.applicationId ?? null,
      input.sensitive ?? input.kind === "identity",
    ],
  );
  return row!;
}

export async function readDocument(tx: Tx, documentId: string): Promise<{ doc: StoredDocument; data: Buffer }> {
  const doc = await tx.one<StoredDocument>("select * from documents where id = $1", [documentId]);
  if (!doc) throw new Error("Document not found");
  return { doc, data: await getStorage().get(doc.storage_path) };
}

export async function deleteDocument(tx: Tx, documentId: string) {
  const doc = await tx.one<StoredDocument>("delete from documents where id = $1 returning *", [documentId]);
  if (doc) await getStorage().remove(doc.storage_path);
  return !!doc;
}
