import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Return the browser client for your existing Supabase project when a feature needs it. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Vite.");
  }
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("The browser client requires a publishable key. Keep secret keys in .env.server.local.");
  }
  // Supabase uses the signed-in user's token and your existing row-level security policies.
  client = createClient(url, key, {
    // PKCE returns OAuth results as ?code=... in the query string. The default flow puts tokens in
    // the URL hash, which would collide with this app's #/page routing.
    auth: { flowType: "pkce" },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }) },
  });
  return client;
}
