import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

/** Read only the three credential files; never print their values. Requires Node 22+. */
function loadSettings() {
  const settings = {};
  for (const name of [".env.local", ".env.server.local", ".env.supabase.local"]) {
    const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
    if (existsSync(path)) Object.assign(settings, parseEnv(readFileSync(path, "utf8")));
  }
  return { ...settings, ...process.env };
}

/** Refuse insecure endpoints before sending a credential. */
function projectUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use the HTTPS project URL from your Supabase Connect dialog.");
  }
  return url.origin;
}

/** GET requests only: this check never changes tables, users, policies, or data. */
async function check(label, url, headers) {
  try {
    const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      console.error(`${label}: failed (HTTP ${response.status}). Check this credential and its permissions.`);
      process.exitCode = 1;
    } else console.log(`${label}: accepted.`);
    await response.body?.cancel();
  } catch {
    console.error(`${label}: request failed. Check the project URL and network connection.`);
    process.exitCode = 1;
  }
}

try {
  const env = loadSettings();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local first.");
  }
  const url = projectUrl(env.VITE_SUPABASE_URL);
  if (!env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key, never a secret key.");
  }
  await check("Publishable key", `${url}/auth/v1/settings`, { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY });
  if (env.SUPABASE_SECRET_KEY) {
    if (!env.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY must be the project's sb_secret_ key.");
    const adminUrl = projectUrl(env.SUPABASE_URL || url);
    if (adminUrl !== url) throw new Error("SUPABASE_URL must match VITE_SUPABASE_URL so both keys target the same project.");
    await check("Secret key", `${adminUrl}/rest/v1/`, { apikey: env.SUPABASE_SECRET_KEY });
  } else console.log("Secret key: not supplied (optional for browser access).");
  if (env.SUPABASE_ACCESS_TOKEN) {
    const ref = env.SUPABASE_PROJECT_REF;
    if (!ref || !/^[a-z0-9]+$/.test(ref)) throw new Error("Set SUPABASE_PROJECT_REF in .env.supabase.local.");
    if (new URL(url).hostname.endsWith(".supabase.co") && new URL(url).hostname !== `${ref}.supabase.co`) {
      throw new Error("SUPABASE_PROJECT_REF must identify the same project as VITE_SUPABASE_URL.");
    }
    await check("Management token", `https://api.supabase.com/v1/projects/${ref}`, { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` });
  } else console.log("Management token: not supplied (optional for app access).");
  if (!process.exitCode) console.log("Connection checks complete. Table access and app persistence have not been tested or changed.");
} catch (error) {
  // Errors here are configuration messages only, never response bodies or credential values.
  console.error(error instanceof TypeError ? "Invalid project URL. Copy the HTTPS URL from Supabase." : error.message);
  process.exitCode = 1;
}
