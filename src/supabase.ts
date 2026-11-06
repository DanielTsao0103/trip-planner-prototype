import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Validate the public connection settings used by both browser clients. */
function connectionSettings() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Vite.",
    );
  }
  if (!key.startsWith("sb_publishable_")) {
    throw new Error(
      "The browser client requires a publishable key. Keep secret keys in .env.server.local.",
    );
  }
  return { url, key };
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, key } = connectionSettings();
  // Supabase uses the signed-in user's token and your existing row-level security policies.
  client = createClient(url, key, {
    // PKCE returns OAuth results as ?code=... in the query string. The default flow puts tokens in
    // the URL hash, which would collide with this app's #/page routing.
    auth: { flowType: hasEmailLink() ? "implicit" : "pkce" },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(20000),
        }),
    },
  });
  return client;
}

// Isolate signup-link requests so they never change the trip owner’s session.
let mailClient: SupabaseClient | undefined;

export async function sendTripSignupLink(email: string, tripId: string): Promise<void> {
  const { url, key } = connectionSettings();
  mailClient ??= createClient(url, key, {
    auth: {
      storageKey: "trip-invite-mail",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
  const callback = new URL(location.pathname, location.origin);
  callback.searchParams.set("trip_invite", tripId);
  const { error } = await mailClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: callback.href,
      data: { trip_account_setup: true },
    },
  });
  if (error)
    throw new Error(
      error.status === 429
        ? "Email sending is temporarily limited. Please retry later."
        : "The email service could not send the setup link.",
    );
}

export function hasEmailLink(): boolean {
  const hash = new URLSearchParams(location.hash.slice(1));
  return (
    hash.has("access_token") &&
    ["invite", "signup", "magiclink"].includes(hash.get("type") || "")
  );
}
