/** Opt-in live QA. Creates two temporary accounts, verifies isolation, then removes them.
 * Requires ignored .env.local / .env.server.local and a running app at TRIP_QA_URL.
 * No credentials or user data are printed. Existing rows are never edited. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
const env = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...parseEnv(readFileSync(".env.server.local", "utf8")),
  ...process.env,
};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SUPABASE_SECRET_KEY, options);
const accounts = [];
let browser;
const results = [];
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
try {
  for (const label of ["owner", "other"]) {
    const email = `trip-qa-${label}-${randomUUID()}@example.com`;
    const password = `${randomUUID()}aA1!`;
    const { user } = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "QA Traveler" },
      }),
    );
    const account = {
      id: user.id,
      email,
      password,
      client: createClient(url, key, options),
    };
    accounts.push(account);
    check(await account.client.auth.signInWithPassword({ email, password }));
  }
  const [owner, other] = accounts;
  const id = randomUUID();
  const row = {
    tripID: id,
    created_by: owner.id,
    owner_id: owner.id,
    trip_name: "Live account QA",
    destination: "Taipei",
    destinations: ["Taipei", "Kaohsiung"],
    start_date: "2027-05-01",
    end_date: "2027-05-04",
    timezone: "Asia/Taipei",
  };
  check(await owner.client.from("trip").insert(row));
  assert.equal(
    check(await owner.client.from("trip").select("*").eq("tripID", id).single())
      .revision,
    1,
  );
  const memberships = check(
    await owner.client
      .from("trip_member")
      .select("userID,status,role(role_name)")
      .eq("tripID", id),
  );
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].userID, owner.id);
  assert.equal(memberships[0].role.role_name, "Owner");
  results.push("Trip and owner membership created atomically");
  // Same request UUID is a safe retry and cannot create a second membership.
  check(
    await owner.client
      .from("trip")
      .upsert(row, { onConflict: "tripID", ignoreDuplicates: true }),
  );
  assert.equal(
    check(
      await owner.client
        .from("trip_member")
        .select("trip_memberID")
        .eq("tripID", id),
    ).length,
    1,
  );
  assert.deepEqual(
    check(await other.client.from("trip").select("*").eq("tripID", id)),
    [],
  );
  assert.deepEqual(
    check(
      await other.client
        .from("trip")
        .update({ trip_name: "Intrusion" })
        .eq("tripID", id)
        .select("tripID"),
    ),
    [],
  );
  assert.deepEqual(
    check(
      await other.client
        .from("trip")
        .delete()
        .eq("tripID", id)
        .select("tripID"),
    ),
    [],
  );
  assert.deepEqual(
    check(await other.client.from("trip_member").select("*").eq("tripID", id)),
    [],
  );
  assert.ok(
    (await other.client.from("trip").insert({ ...row, tripID: randomUUID() }))
      .error,
  );
  assert.ok(
    (
      await owner.client
        .from("trip")
        .update({ owner_id: other.id })
        .eq("tripID", id)
    ).error,
  );
  assert.ok(
    (
      await other.client
        .from("trip_member")
        .insert({ tripID: id, userID: other.id, status: "accepted" })
    ).error,
  );
  assert.ok(
    (
      await owner.client
        .from("trip")
        .insert({ ...row, tripID: randomUUID(), trip_name: " " })
    ).error,
  );
  assert.ok(
    (
      await owner.client
        .from("trip")
        .insert({ ...row, tripID: randomUUID(), end_date: "2026-01-01" })
    ).error,
  );
  const anon = createClient(url, key, options);
  assert.ok((await anon.from("trip").select("*")).error);
  results.push(
    "Other-account reads, edits, deletes, ownership spoofing, membership injection, and anonymous access blocked",
  );
  check(
    await owner.client
      .from("trip")
      .update({ trip_name: "Live updated QA" })
      .eq("tripID", id)
      .eq("revision", 1),
  );
  assert.deepEqual(
    check(
      await owner.client
        .from("trip")
        .update({ trip_name: "Stale edit" })
        .eq("tripID", id)
        .eq("revision", 1)
        .select("*"),
    ),
    [],
  );
  results.push("Server validation and stale-edit protection passed");
  browser = await chromium.launch();
  const base =
    env.TRIP_QA_URL || "http://127.0.0.1:4173/trip-planner-prototype/";
  async function openAccount(account) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByRole("heading", { name: "Where to next, QA?" }).waitFor();
    return { page, context };
  }
  const first = await openAccount(owner);
  await first.page.goto(`${base}#/6`);
  await first.page
    .getByLabel("Trip title", { exact: true })
    .fill("Browser account QA");
  await first.page
    .getByLabel("Where are you going?", { exact: true })
    .fill("Kyoto");
  await first.page.getByLabel("Start date", { exact: true }).fill("2027-06-01");
  await first.page.getByLabel("End date", { exact: true }).fill("2027-06-04");
  await first.page
    .getByRole("button", { name: "Create trip", exact: true })
    .click();
  await first.page
    .getByRole("button", { name: "Browser account QA", exact: true })
    .waitFor();
  await first.page.reload();
  await first.page
    .getByRole("button", { name: "Browser account QA", exact: true })
    .waitFor();
  await first.context.close();
  const fresh = await openAccount(owner);
  await fresh.page.goto(`${base}#/5`);
  await fresh.page
    .getByRole("button", { name: "Browser account QA", exact: true })
    .waitFor();
  await fresh.page.screenshot({
    path: "/tmp/trip-account-qa/account-trips-desktop.png",
    fullPage: true,
  });
  const second = await openAccount(other);
  await second.page.goto(`${base}#/5`);
  await second.page
    .getByRole("heading", { name: "Your first trip is waiting." })
    .waitFor();
  assert.equal(
    await second.page
      .getByRole("button", { name: "Browser account QA", exact: true })
      .count(),
    0,
  );
  results.push(
    "Real browser create, reload, fresh-browser login, and second-account isolation passed",
  );
  await fresh.page
    .getByRole("button", {
      name: "Delete trip: Browser account QA",
      exact: true,
    })
    .click();
  await fresh.page
    .getByRole("button", { name: "Delete trip", exact: true })
    .click();
  await fresh.page.getByRole("dialog").waitFor({ state: "hidden" });
  await fresh.page.reload();
  assert.equal(
    await fresh.page
      .getByRole("button", { name: "Browser account QA", exact: true })
      .count(),
    0,
  );
  results.push("Browser deletion persists");
  console.log(results.join("\n"));
} finally {
  await browser?.close();
  for (const account of accounts) {
    check(await account.client.auth.signOut({ scope: "global" }));
    check(await admin.from("trip").delete().eq("owner_id", account.id));
    check(await admin.from("user").delete().eq("userID", account.id));
    check(await admin.auth.admin.deleteUser(account.id));
    assert.equal(
      check(
        await admin.from("trip").select("tripID").eq("owner_id", account.id),
      ).length,
      0,
    );
    assert.equal(
      check(
        await admin
          .from("trip_member")
          .select("trip_memberID")
          .eq("userID", account.id),
      ).length,
      0,
    );
  }
  console.log(
    "Temporary QA accounts, profiles, trips, and memberships removed.",
  );
}
