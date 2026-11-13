/** Explicit live QA: generated accounts only. API keys stay in process memory.
 * Calls free providers once via the real browser -> Edge Function -> database path.
 * Requires an authorized Supabase CLI and the local preview. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
const env = { ...parseEnv(readFileSync(".env.local", "utf8")), ...process.env };
const project = "mzwydinhvgmwhnwlomnn";
const raw = execFileSync("cmd.exe", ["/d", "/s", "/c", `npx --yes supabase projects api-keys --remote=${project} --reveal --output json`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const keys = JSON.parse(raw.slice(raw.indexOf("[")));
const secret = keys.find(k => k.type === "secret") || keys.find(k => k.name === "service_role");
const secretValue = secret?.api_key || secret?.key || secret?.value;
if (!secretValue) throw Error("An authorized server key is unavailable; no credentials were printed.");
const url = env.VITE_SUPABASE_URL, publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(url).hostname, `${project}.supabase.co`);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretValue, options);
const check = result => { if (result.error) throw Error(result.error.message); return result.data; };
const accounts = [];
let browser;
const chainMode = env.NEARBY_QA_CHAIN_LOCATION === "1";
const artifact = chainMode ? "test-results/nearby-location-live" : "test-results/nearby-live";
mkdirSync(artifact, { recursive: true });
try {
  for (const role of ["owner", "outsider"]) {
    const email = `nearby-qa-${role}-${randomUUID()}@example.com`, password = `${randomUUID()}aA1!`;
    const { user } = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Nearby QA Traveler" } }));
    const client = createClient(url, publishable, options);
    accounts.push({ id: user.id, email, password, client });
    check(await client.auth.signInWithPassword({ email, password }));
  }
  const [owner, outsider] = accounts;
  const trip = { id: randomUUID(), title: "Nearby live QA", destinations: ["Seattle, WA"], start: "2027-05-01", end: "2027-05-02", zone: "America/Los_Angeles", image: "", members: [{ id: owner.id, name: "Nearby QA Traveler", email: owner.email, role: "Owner", status: "accepted", days: [] }], prefs: { [owner.id]: { diet: ["Vegetarian"], access: ["Step-free access"], walk: 1000, interests: ["Art"], food: "Local flavors", spending: "Moderate", dining: "Casual & simple", atmosphere: "Relaxed", destinations: "", tickets: "Happy to book ahead", notes: "" } }, events: [], expenses: [], budget: 30000, budgetMode: "group", individual: {}, todos: [], dismissed: [] };
  if (chainMode) { trip.prefs = {}; trip.events = [{ id: randomUUID(), name: "Morning meeting", place: "McDonald's", date: trip.start, start: "09:00", end: "10:00", cost: 0, attendees: [owner.id], image: "", notes: "" }]; }
  const saved = check(await owner.client.rpc("save_account_trip", { p_trip_id: trip.id, p_expected_revision: null, p_request_id: randomUUID(), p_data: trip, p_photo_credit: null }));
  const body = { tripId: trip.id, revision: saved.revision, date: trip.start, intent: chainMode ? "activity" : "lunch" };
  const endpoint = `${url}/functions/v1/nearby-suggestions`;
  assert.equal((await fetch(endpoint, { method: "POST", headers: { apikey: publishable, "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 401);
  const outsiderToken = (await outsider.client.auth.getSession()).data.session.access_token;
  assert.equal((await fetch(endpoint, { method: "POST", headers: { apikey: publishable, Authorization: `Bearer ${outsiderToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 403);
  console.log("PASS: real endpoint rejects unsigned callers and cross-trip access.");
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(env.TRIP_QA_URL || "http://127.0.0.1:5193/");
  // The developer preview may have demo routing; a fresh context owns no stored sessions.
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/#\/4/);
  await page.goto(new URL("#/5", page.url()).href);
  await page.getByRole("button", { name: trip.title, exact: true }).click();
  await page.goto(new URL("#/17", page.url()).href);
  await page.getByRole("button", { name: "Nearby suggestion", exact: true }).click();
  if (chainMode) {
    await page.getByLabel("Find", { exact: true }).selectOption("activity");
    assert.ok((await page.locator(".nearby-context-panel").innerText()).includes("McDonald's · Seattle, WA"));
  }
  const responsePromise = page.waitForResponse(r => r.url() === endpoint && r.request().method() === "POST", { timeout: 90000 });
  await page.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  const response = await responsePromise;
  const result = await response.json();
  if (response.ok()) await page.getByRole("heading", { name: "Options to review", exact: true }).scrollIntoViewIfNeeded();
  writeFileSync(`${artifact}/response.json`, JSON.stringify({ status: response.status(), ...result }, null, 2));
  await page.screenshot({ path: `${artifact}/desktop.png`, fullPage: true });
  assert.equal(response.status(), 200, result.message || "Live research failed");
  assert.ok(Array.isArray(result.results)); assert.ok(result.results.length <= 3);
  if (!chainMode) assert.ok(result.results.length > 0, "No live candidates survived the evidence checks; inspect response.json.");
  else {
    assert.ok(result.diagnostics, "Expected stage-specific search diagnostics");
    if (!result.results.length) assert.equal(typeof result.emptyReason, "string");
  }
  for (const candidate of result.results) { assert.equal(candidate.status, "review"); assert.ok(candidate.facts.length > 0); }
  if (result.results.length) {
    const mapsLink = await page.getByRole("link", { name: "View on Google Maps", exact: true }).first().getAttribute("href");
    const yelpLink = await page.getByRole("link", { name: "View on Yelp", exact: true }).first().getAttribute("href");
    assert.equal(new URL(mapsLink).hostname, "www.google.com"); assert.equal(new URL(mapsLink).searchParams.get("api"), "1");
    assert.ok(new URL(yelpLink).hostname === "www.yelp.com" || new URL(yelpLink).hostname.endsWith(".yelp.com"));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${artifact}/mobile.png`, fullPage: true });
  const immediate = await owner.client.functions.invoke("nearby-suggestions", { body });
  assert.ok(immediate.error); assert.equal(immediate.error.context.status, 429);
  console.log(`PASS: browser → live function → real database → Tavily → Groq returned ${result.results.length} review candidates; immediate repeat blocked by quota.`);
} finally {
  if (browser) await browser.close();
  const failures = [];
  for (const account of accounts) {
    try { check(await admin.from("trip").delete().eq("owner_id", account.id)); check(await admin.from("user").delete().eq("userID", account.id)); check(await admin.auth.admin.deleteUser(account.id)); }
    catch { failures.push(account.id); }
  }
  if (failures.length) throw Error("Temporary QA cleanup needs attention; inspect generated test accounts using the admin dashboard.");
  console.log("Temporary QA accounts and trips removed.");
}
