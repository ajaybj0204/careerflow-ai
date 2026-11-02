"use server";

import { redirect } from "next/navigation";
import { discoverJobs, saveListing } from "@careerflow/core";
import { slugify } from "@careerflow/shared";
import { act, optStr, str, type ActionState } from "@/lib/action";
import { assertRateLimit } from "@/lib/rate-limit";
import { userDb, withUser } from "@/lib/session";

export async function discoverAction(_: ActionState, f: FormData) {
  return act(async () => {
    const { user, db } = await userDb();
    assertRateLimit(user.id, "discover", 10, 60_000);
    const keywords = str(f, "keywords");
    if (!keywords) throw new Error("Enter a role or keywords.");
    const r = await discoverJobs(db, user.id, { keywords: keywords.slice(0, 120), location: optStr(f, "location"), providers: f.getAll("providers").map(String) });
    const errs = r.errors.length ? ` Some sources failed: ${r.errors.map((e) => `${e.provider} (${e.error})`).join(", ")}.` : "";
    return { message: `Fetched ${r.fetched} listing(s) from ${r.providers.join(", ") || "no sources"}; ${r.stored} new after removing duplicates.${errs}` };
  }, ["/app/discover"]);
}

export async function saveListingAction(_: ActionState, f: FormData) {
  let id: string | null = null;
  const r = await act(async () => {
    const res = await withUser((tx, u) => saveListing(tx, u.id, str(f, "id")));
    id = res.application.id;
    return { message: res.duplicateOf ? "Already saved — opening it." : "Saved to your opportunities." };
  }, ["/app/discover", "/app/saved"]);
  if (r.ok && id && f.get("open") === "1") redirect(`/app/applications/${id}`);
  return r;
}

export async function dismissListingAction(_: ActionState, f: FormData) {
  return act(async () => {
    await withUser((tx) => tx.query("update job_listings set dismissed = true where id = $1", [str(f, "id")]));
  }, ["/app/discover"]);
}

export async function alertAction(_: ActionState, f: FormData) {
  return act(async () => {
    const op = str(f, "op");
    await withUser(async (tx, u) => {
      if (op === "create") {
        if (!str(f, "keywords")) throw new Error("Keywords are required.");
        await tx.query("insert into job_alerts (user_id, name, keywords, location, frequency) values ($1,$2,$3,$4,$5)", [u.id, str(f, "name") || str(f, "keywords"), str(f, "keywords"), optStr(f, "location"), str(f, "frequency") || "daily"]);
      } else if (op === "toggle") await tx.query("update job_alerts set active = not active where id = $1", [str(f, "id")]);
      else if (op === "delete") await tx.query("delete from job_alerts where id = $1", [str(f, "id")]);
    });
    return { message: op === "create" ? "Alert created. It runs in the background on its schedule." : "Updated." };
  }, ["/app/discover"]);
}

export async function portalAction(_: ActionState, f: FormData) {
  return act(async () => {
    const op = str(f, "op");
    await withUser(async (tx, u) => {
      if (op === "favorite") {
        const exists = await tx.one("select 1 from portal_favorites where source_id = $1", [str(f, "id")]);
        if (exists) await tx.query("delete from portal_favorites where source_id = $1", [str(f, "id")]);
        else await tx.query("insert into portal_favorites (user_id, source_id) values ($1,$2)", [u.id, str(f, "id")]);
      } else if (op === "custom") {
        const url = str(f, "url");
        if (!/^https:\/\//i.test(url)) throw new Error("Portal URL must start with https://");
        const name = str(f, "name");
        if (!name) throw new Error("Name is required.");
        await tx.query("insert into job_sources (user_id, slug, name, url, category, description) values ($1,$2,$3,$4,'custom',$5)", [u.id, `custom-${slugify(name)}-${Date.now().toString(36)}`, name, url, optStr(f, "description")]);
      } else if (op === "delete-custom") await tx.query("delete from job_sources where id = $1 and user_id is not null", [str(f, "id")]);
      else if (op === "search") {
        const url = str(f, "url");
        if (!/^https:\/\//i.test(url)) throw new Error("Search URL must start with https://");
        await tx.query("insert into saved_searches (user_id, source_id, label, url) values ($1,$2,$3,$4)", [u.id, optStr(f, "sourceId"), str(f, "label") || url, url]);
      } else if (op === "delete-search") await tx.query("delete from saved_searches where id = $1", [str(f, "id")]);
    });
    return { message: "Saved." };
  }, ["/app/portals"]);
}
