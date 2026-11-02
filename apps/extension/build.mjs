// Copies the extension into dist/ and validates the manifest. Load dist/ via chrome://extensions → "Load unpacked".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "src");
const dist = path.join(here, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dist, f));

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
const problems = [];
if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
if ((manifest.host_permissions ?? []).length) problems.push("host_permissions must be empty (use optional_host_permissions)");
for (const p of manifest.permissions ?? []) if (!["activeTab", "scripting", "storage"].includes(p)) problems.push(`unexpected permission: ${p}`);
for (const f of [manifest.action?.default_popup, manifest.options_page]) if (f && !fs.existsSync(path.join(dist, f))) problems.push(`missing file: ${f}`);
if (problems.length) {
  console.error("Extension build failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Extension built in ${dist} (${fs.readdirSync(dist).length} files).`);
