import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client for server components, actions and route handlers (anon key + user cookies only). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          /* called from a server component: middleware refreshes the session instead */
        }
      },
    },
  });
}

/** Deletes a Supabase auth user with the service role key (server only). */
export async function deleteSupabaseUser(userId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to delete accounts.");
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { authorization: `Bearer ${key}`, apikey: key } });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete the account (${res.status}).`);
}
