/** Opt-in integration tests against the real configured project. Only generated QA
 * accounts/trips are changed; cleanup runs even when an assertion fails. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { detailJourney, saved } from "./trip-detail-browser-flow.mjs";
import { createClient } from "@supabase/supabase-js";
const env = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...parseEnv(readFileSync(".env.server.local", "utf8")),
  ...process.env,
};
const options = {
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
  auth: { persistSession: false, autoRefreshToken: false },
};
const client = () =>
  createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options,
  );
const admin = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  options,
);
const accounts = [];
const check = (response) => {
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
mkdirSync("/tmp/trip-account-qa", { recursive: true });
let checks = 0;
try {
  for (let i = 0; i < 2; i++) {
    const email = `full-trip-qa-${randomUUID()}@example.com`,
      password = `${randomUUID()}aA1!`;
    const { user } = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "QA Traveler" },
      }),
    );
    const account = { id: user.id, email, password, client: client() };
    accounts.push(account);
    writeFileSync(
      "/tmp/trip-account-qa/full-qa-accounts.json",
      JSON.stringify(accounts.map((a) => ({ id: a.id, email: a.email }))),
    );
    check(await account.client.auth.signInWithPassword({ email, password }));
  }
  const [owner, other] = accounts;
  const guest = randomUUID(),
    pending = randomUUID(),
    eventId = randomUUID();
  const preference = {
    diet: ["Vegetarian"],
    food: "Local food",
    spending: "Moderate",
    dining: "Casual & simple",
    atmosphere: "Relaxed",
    access: ["Step-free access"],
    walk: 1500,
    interests: ["Museums"],
    destinations: "Old town",
    tickets: "Happy to book ahead",
    notes: "A slower pace",
  };
  const trip = {
    id: randomUUID(),
    title: "Complete persistence QA",
    destinations: ["Taipei", "Kaohsiung"],
    start: "2027-05-01",
    end: "2027-05-04",
    zone: "Asia/Taipei",
    image: "/trip-planner-prototype/assets/coast.jpg",
    members: [
      {
        id: owner.id,
        name: "QA Traveler",
        email: owner.email,
        role: "Owner",
        days: [],
        status: "accepted",
      },
      {
        id: guest,
        name: "QA Guest",
        email: `guest-${randomUUID()}@example.com`,
        role: "Day Editor",
        days: ["2027-05-02"],
        status: "accepted",
      },
      {
        id: pending,
        name: "QA Pending",
        email: other.email,
        role: "Editor",
        days: [],
        status: "pending",
      },
    ],
    events: [
      {
        id: eventId,
        name: "Museum",
        place: "National museum",
        date: "2027-05-02",
        start: "10:00",
        end: "11:00",
        cost: 1007,
        attendees: [owner.id, guest],
        image: "/museum.jpg",
        notes: "Bring tickets",
      },
    ],
    expenses: [
      {
        id: randomUUID(),
        purpose: "Shared lunch",
        amount: 1001,
        category: "Food",
        payer: owner.id,
        shares: { [owner.id]: 501, [guest]: 500 },
        date: "2027-04-30",
        source: "Manual",
        settled: [],
      },
    ],
    prefs: { [owner.id]: preference },
    budget: 100000,
    budgetMode: "group",
    individual: { [owner.id]: 60000, [guest]: 40000 },
    todos: [
      {
        id: randomUUID(),
        text: "Pack tickets",
        date: "2027-05-02",
        done: false,
      },
    ],
    dismissed: ["sample-gallery"],
  };
  const save = (data, revision, actor = owner, request = randomUUID()) =>
    actor.client.rpc("save_trip_bundle", {
      p_trip_id: trip.id,
      p_expected_revision: revision,
      p_request_id: request,
      p_data: data,
    });
  console.log("Testing full aggregate creation and round-trip…");
  let row = check(await save(trip, null));
  checks++;
  assert.equal(row.content_version, 1);
  assert.equal(row.owner_id, owner.id);
  assert.deepEqual(row.destinations, trip.destinations);
  assert.equal(row.trip_name, trip.title);
  assert.equal(row.start_date, trip.start);
  assert.equal(row.end_date, trip.end);
  assert.equal(row.timezone, trip.zone);
  assert.equal(row.content.image, trip.image);
  assert.equal(row.content.budget, trip.budget);
  assert.equal(row.content.budgetMode, trip.budgetMode);
  assert.deepEqual(row.content.individual, trip.individual);
  assert.deepEqual(row.content.prefs, trip.prefs);
  assert.deepEqual(row.content.todos, trip.todos);
  assert.deepEqual(row.content.dismissed, trip.dismissed);
  assert.deepEqual(row.content.events[0], {
    ...trip.events[0],
    attendees: [owner.id, guest].sort(),
  });
  assert.deepEqual(row.content.expenses, trip.expenses);
  for (const member of trip.members)
    assert.deepEqual(
      row.content.members.find((m) => m.id === member.id),
      member,
    );
  checks += 17;
  const memberships = check(
    await owner.client
      .from("trip_member")
      .select("userID,planner_id")
      .eq("tripID", trip.id),
  );
  assert.equal(memberships.filter((m) => m.userID !== null).length, 1);
  checks++;
  // Retrying a lost creation response is idempotent and does not add memberships.
  const retry = check(await save(trip, null));
  assert.equal(retry.revision, row.revision);
  checks++;
  assert.ok(
    (
      await owner.client
        .from("trip")
        .update({ end_date: "2027-05-01" })
        .eq("tripID", trip.id)
    ).error,
  );
  checks++;
  assert.ok(
    (
      await owner.client
        .from("trip")
        .update({ content_version: 0, last_write_hash: "forged" })
        .eq("tripID", trip.id)
    ).error,
  );
  checks++;
  const fresh = client();
  check(
    await fresh.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    }),
  );
  const loaded = check(
    await fresh.rpc("load_trip_bundles", { p_offset: 0, p_limit: 500 }),
  );
  assert.deepEqual(loaded[0], row);
  checks++;
  assert.deepEqual(check(await other.client.rpc("load_trip_bundles")), []);
  checks++;
  assert.ok((await save(trip, row.revision, other)).error);
  checks++;
  const tables = [
    "event",
    "trip_member",
    "trip_member_day",
    "trip_event_attendee",
    "trip_expense",
    "trip_expense_share",
    "trip_person_budget",
    "trip_preference",
    "trip_todo",
    "trip_dismissed_suggestion",
  ];
  for (const table of tables) {
    const key = ["event", "trip_member"].includes(table) ? "tripID" : "trip_id";
    assert.deepEqual(
      check(await other.client.from(table).select("*").eq(key, trip.id)),
      [],
    );
    checks++;
  }
  assert.ok(
    (
      await other.client.from("trip_todo").insert({
        trip_id: trip.id,
        id: "injected",
        reminder: "bad",
        reminder_date: trip.start,
        done: false,
      })
    ).error,
  );
  checks++;
  assert.ok((await client().rpc("load_trip_bundles")).error);
  checks++;
  assert.ok(
    (
      await client().rpc("save_trip_bundle", {
        p_trip_id: trip.id,
        p_expected_revision: row.revision,
        p_request_id: randomUUID(),
        p_data: trip,
      })
    ).error,
  );
  checks++;
  console.log("Testing rejected writes and transaction rollback…");
  const invalid = [];
  let bad = structuredClone(trip);
  bad.expenses[0].shares[guest] = 499;
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.events[0].date = "2028-01-01";
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.events.push({ ...bad.events[0], id: randomUUID() });
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.events[0].attendees.push(randomUUID());
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.expenses[0].amount = 1.2;
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.members[0].role = "Viewer";
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.members[1].days = [];
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.todos[0].date = "2028-01-01";
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.prefs[owner.id].notes = "x".repeat(2201);
  invalid.push(bad);
  bad = structuredClone(trip);
  delete bad.events;
  invalid.push(bad);
  bad = structuredClone(trip);
  delete bad.events[0].notes;
  invalid.push(bad);
  bad = structuredClone(trip);
  bad.members[1].email = owner.email;
  invalid.push(bad);
  for (const payload of invalid) {
    assert.ok(
      (await save(payload, row.revision)).error,
      "Malformed aggregate was accepted",
    );
    assert.deepEqual(
      check(await owner.client.rpc("load_trip_bundles"))[0],
      row,
      "Rejected save must roll back every table",
    );
    checks += 2;
  }
  console.log("Testing edits, repayments, and removals…");
  const proposals = [
    { ...trip, title: "Concurrent one" },
    { ...trip, title: "Concurrent two" },
  ];
  const races = await Promise.all(proposals.map((d) => save(d, row.revision)));
  assert.equal(races.filter((r) => !r.error).length, 1);
  assert.equal(races.find((r) => r.error).error.code, "PT409");
  checks += 2;
  row = races.find((r) => !r.error).data;
  check(
    await owner.client
      .from("trip")
      .update({ trip_name: "Older client edit" })
      .eq("tripID", trip.id),
  );
  const staleRetry = await save(
    proposals.find((p) => p.title === row.trip_name),
    row.revision,
  );
  assert.equal(staleRetry.error.code, "PT409");
  checks++;
  row = check(await owner.client.rpc("load_trip_bundles"))[0];
  trip.title = "Edited full trip";
  trip.events[0].notes = "Updated note";
  trip.todos[0].done = true;
  trip.budgetMode = "individual";
  trip.prefs[owner.id].walk = 2000;
  const stale = row.revision;
  row = check(await save(trip, stale));
  checks++;
  bad = structuredClone(trip);
  bad.title = "Stale overwrite";
  assert.equal((await save(bad, stale)).error.code, "PT409");
  checks++;
  trip.expenses[0].settled = [guest];
  row = check(await save(trip, row.revision));
  checks++;
  bad = structuredClone(trip);
  bad.expenses = [];
  assert.ok((await save(bad, row.revision)).error);
  checks++;
  bad = structuredClone(trip);
  bad.expenses[0].settled = [];
  assert.ok((await save(bad, row.revision)).error);
  checks++;
  trip.members[1].status = "removed";
  row = check(await save(trip, row.revision));
  assert.equal(row.content.expenses[0].shares[guest], 500);
  checks++;
  trip.events = [];
  trip.todos = [];
  trip.dismissed = [];
  row = check(await save(trip, row.revision));
  assert.deepEqual(row.content.events, []);
  assert.deepEqual(row.content.todos, []);
  assert.deepEqual(row.content.dismissed, []);
  trip.members[1].days = [];
  trip.end = trip.start;
  row = check(await save(trip, row.revision));
  assert.equal(row.end_date, trip.start);
  checks++;

  checks += 3;
  check(await owner.client.from("trip").delete().eq("tripID", trip.id));
  for (const table of tables) {
    const key = ["event", "trip_member"].includes(table) ? "tripID" : "trip_id";
    assert.deepEqual(
      check(await admin.from(table).select("*").eq(key, trip.id)),
      [],
    );
    checks++;
  }
  if (env.TRIP_QA_URL) {
    console.log("Testing real browser detail forms and fresh-browser reload…");
    const browser = await chromium.launch({ headless: true });
    try {
      const base = env.TRIP_QA_URL;
      const login = async (page) => {
        await page.goto(base);
        await page.getByLabel("Email", { exact: true }).fill(owner.email);
        await page.getByLabel("Password", { exact: true }).fill(owner.password);
        await page.getByRole("button", { name: "Log in", exact: true }).click();
        await saved(page);
      };
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page);
      await detailJourney(page, base);
      const all = check(await owner.client.rpc("load_trip_bundles"));
      const stored = all.find((t) => t.trip_name === "Full detail browser QA");
      assert.ok(stored);
      assert.equal(stored.content.events[0].notes, "Bring printed tickets");
      assert.equal(stored.content.expenses[0].settled.length, 1);
      assert.equal(stored.content.todos[0].done, true);
      checks += 4;
      await page.screenshot({
        path: "/tmp/trip-account-qa/full-detail-browser.png",
        fullPage: true,
      });
      const clean = await browser.newContext();
      const freshPage = await clean.newPage();
      await login(freshPage);
      await freshPage.goto(base + "#/5");
      await freshPage
        .getByRole("button", { name: "Full detail browser QA", exact: true })
        .click();
      await saved(freshPage);
      await freshPage.goto(base + "#/7?event=" + stored.content.events[0].id);
      assert.equal(
        await freshPage
          .getByLabel("Notes (optional)", { exact: true })
          .inputValue(),
        "Bring printed tickets",
      );
      checks++;
      await clean.close();
      await context.close();
    } finally {
      await browser.close();
    }
  }
  console.log(
    `${checks} live persistence, validation, rollback, isolation, concurrency, and cascade checks passed.`,
  );
} catch (error) {
  console.error("QA assertion failed:", error.message);
  throw error;
} finally {
  const cleanupErrors = [];
  for (const account of accounts) {
    try {
      check(await admin.from("trip").delete().eq("owner_id", account.id));
      check(await admin.from("user").delete().eq("userID", account.id));
      check(await admin.auth.admin.deleteUser(account.id));
    } catch (error) {
      cleanupErrors.push(error.message);
    }
  }
  if (cleanupErrors.length)
    throw new Error(`QA cleanup needs attention: ${cleanupErrors.join("; ")}`);
  console.log("Temporary accounts and all associated trip data removed.");
}
