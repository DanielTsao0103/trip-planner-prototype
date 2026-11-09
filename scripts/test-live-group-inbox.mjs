/** Live inbox + two-account verification. Only generated QA records are changed.
 * The collaborator identity is retained privately for repeatable QA when admin cleanup is unavailable.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  verifyGroupPermissions,
  verifyGroupPermissionScreens,
} from "./test-group-permissions.mjs";
const site = "https://danieltsao0103.github.io/trip-planner-prototype/";
const privateFile =
  process.env.QA_COLLABORATOR_FILE ||
  "../live-destination-qa/inbox-collaborator.local.json";
const out = process.env.QA_OUTPUT || "/tmp/live-group-inbox";
mkdirSync(out, { recursive: true });
const a = JSON.parse(
  readFileSync(
    process.env.QA_ACCOUNT_FILE || "../live-destination-qa/account.local.json",
  ),
);
const client = () =>
  createClient(a.url, a.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = client(),
  guest = client();
const check = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
const original = check(
  await owner.auth.signInWithPassword({ email: a.email, password: a.password }),
);
async function mail(path, { method = "GET", body, token } = {}, attempt = 0) {
  const r = await fetch("https://api.mail.tm" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 429 && attempt < 3) {
    const value = r.headers.get("retry-after");
    const wait = value
      ? Number(value) * 1000 || Date.parse(value) - Date.now()
      : 15000 * (attempt + 1);
    if (wait > 60000)
      throw Error("Inbox service asks for a wait longer than one minute");
    console.log("Disposable inbox read rate limited; honoring retry delay");
    await delay(Math.max(1000, wait));
    return mail(path, { method, body, token }, attempt + 1);
  }
  if (!r.ok) throw Error(`Test inbox ${method} ${path}: ${r.status}`);
  return data;
}
let qa;
if (existsSync(privateFile)) qa = JSON.parse(readFileSync(privateFile));
else {
  const domains = await mail("/domains");
  const domain = domains["hydra:member"].find(
    (d) => d.isActive && !d.isPrivate,
  ).domain;
  qa = {
    email: `trip-qa-${randomUUID()}@${domain}`,
    mailPassword: randomUUID() + "aA1!",
    password: randomUUID() + "aA1!",
    created: new Date().toISOString(),
  };
  const m = await mail("/accounts", {
    method: "POST",
    body: { address: qa.email, password: qa.mailPassword },
  });
  qa.mailId = m.id;
  writeFileSync(privateFile, JSON.stringify(qa), { mode: 0o600 });
}
const mailbox = await mail("/token", {
  method: "POST",
  body: { address: qa.email, password: qa.mailPassword },
});
const messagesBefore = (await mail("/messages", { token: mailbox.token }))[
  "hydra:member"
].map((m) => m.id);
const tripId = randomUUID(),
  eventId = randomUUID();
const draft = {
  id: tripId,
  title: "Live group invitation QA",
  destinations: ["London, United Kingdom"],
  destinationTimezones: ["Europe/London"],
  start: "2027-01-01",
  end: "2027-01-02",
  zone: "Europe/London",
  image: "",
  members: [
    {
      id: a.userId,
      name: original.user.user_metadata.name,
      email: a.email,
      role: "Owner",
      days: [],
      status: "accepted",
    },
  ],
  events: [
    {
      id: eventId,
      name: "Museum entrance",
      place: "221B Baker Street, London",
      point: { lat: 51.52376, lng: -0.15847 },
      date: "2027-01-01",
      start: "10:00",
      end: "11:00",
      cost: 0,
      notes: "",
      image: "",
      attendees: [a.userId],
    },
  ],
  expenses: [],
  prefs: {},
  individual: {},
  todos: [],
  dismissed: [],
  budget: null,
  budgetMode: "group",
};
const evidence = {
  site,
  version: await (await fetch(site + "version.json?t=" + Date.now())).json(),
  checkedAt: new Date().toISOString(),
  checks: [],
  cleanup: false,
  retainedQaIdentity: false,
};
const record = (s) => {
  console.log(s);
  evidence.checks.push(s);
  writeFileSync(out + "/summary.json", JSON.stringify(evidence, null, 2));
};
let browser;
try {
  check(
    await owner.rpc("save_trip_bundle_with_timezones", {
      p_trip_id: tripId,
      p_expected_revision: null,
      p_request_id: randomUUID(),
      p_destination_timezones: draft.destinationTimezones,
      p_data: draft,
    }),
  );
  browser = await chromium.launch();
  const op = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await op.goto(site);
  await op.getByLabel("Email", { exact: true }).fill(a.email);
  await op.getByLabel("Password", { exact: true }).fill(a.password);
  await op.getByRole("button", { name: "Log in", exact: true }).click();
  await op
    .getByRole("button", { name: "Account and preferences", exact: true })
    .waitFor();
  await op.goto(site + "#/5");
  await op.getByRole("button", { name: draft.title, exact: true }).click();
  await op.goto(site + "#/13");
  await op.getByRole("button", { name: "Invite someone", exact: true }).click();
  await op.getByLabel("Email addresses", { exact: true }).fill(qa.email);
  await op.getByLabel("Email addresses", { exact: true }).press("Enter");
  await op
    .getByRole("button", { name: "Send invitations", exact: true })
    .click();
  if (
    await op
      .getByText(/Email sending is temporarily limited/)
      .isVisible()
      .catch(() => false)
  ) {
    console.log(
      "App email sending is rate limited; waiting before a single retry",
    );
    await delay(30000);
    await delay(30000);
    await op
      .getByRole("button", { name: "Send invitations", exact: true })
      .click();
  }
  await expect(op.getByRole("dialog")).toHaveCount(0, { timeout: 25000 });
  record("Owner sent the live invitation through the published Group UI");
  let message;
  for (let i = 0; i < 30; i++) {
    const rows = (await mail("/messages", { token: mailbox.token }))[
      "hydra:member"
    ];
    const fresh = rows.find((m) => !messagesBefore.includes(m.id));
    if (fresh) {
      message = await mail("/messages/" + fresh.id, { token: mailbox.token });
      break;
    }
    await delay(3000);
  }
  assert.ok(
    message,
    "Invitation email did not arrive in the controlled test inbox within 90 seconds",
  );
  const html = Array.isArray(message.html)
    ? message.html.join("\n")
    : String(message.html || "");
  const links = [...html.matchAll(/href=["']([^"']+)["']/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
  const invite = links.find(
    (h) =>
      h.includes("trip_invite=") ||
      h.includes("trip_notice=") ||
      h.includes("/auth/v1/verify"),
  );
  assert.ok(invite, "Delivered email has no trip invitation link");
  record(
    "Real invitation email arrived in the controlled inbox and contains a trip link",
  );
  const gp = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await gp.goto(invite);
  await gp
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .waitFor();
  const signup = await gp
    .getByRole("button", { name: "Create account", exact: true })
    .isVisible();
  if (signup) {
    await gp.getByLabel("Your name", { exact: true }).fill("Invited Traveler");
    await gp.getByLabel("Email", { exact: true }).fill(qa.email);
    await gp.getByLabel("Password", { exact: true }).fill(qa.password);
    await gp
      .getByRole("button", { name: "Create account", exact: true })
      .click();
  } else {
    await gp.getByLabel("Email", { exact: true }).fill(qa.email);
    await gp.getByLabel("Password", { exact: true }).fill(qa.password);
    await gp.getByRole("button", { name: "Log in", exact: true }).click();
  }
  await expect(
    gp.getByRole("heading", { name: "Your trip preferences", exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await gp.getByRole("button", { name: /Tickets & notes/ }).click();
  await gp
    .getByLabel("Anything else the group should know?", { exact: true })
    .fill("Live collaborator preference verification");
  await gp
    .getByRole("button", { name: "Save and open trip", exact: true })
    .click();
  await expect(gp).toHaveURL(/#\/8$/, { timeout: 20000 });
  const auth = check(
    await guest.auth.signInWithPassword({
      email: qa.email,
      password: qa.password,
    }),
  );
  qa.userId = auth.user.id;
  writeFileSync(privateFile, JSON.stringify(qa), { mode: 0o600 });
  evidence.retainedQaIdentity = true;
  let row = check(await owner.rpc("read_invited_trip", { p_trip: tripId }));
  const traveler = row.content.members.find((m) => m.accountId === qa.userId);
  assert.ok(traveler);
  assert.equal(traveler.role, "Viewer");
  assert.equal(
    row.content.prefs[traveler.id].notes,
    "Live collaborator preference verification",
  );
  await gp.reload();
  await expect(
    gp.getByRole("heading", { name: draft.title, exact: true }).first(),
  ).toBeVisible();
  record(
    "Separate mobile account accepted the email invitation, was required to save preferences, joined as Viewer, and survived reload; owner independently read its saved answers",
  );
  await gp.goto(site + "#/13");
  await gp.screenshot({
    path: out + "/joined-collaborator.png",
    fullPage: true,
  });
  await browser.close();
  browser = null;
  // Hosted policy suite uses actual authenticated clients, not route mocks.
  row = await verifyGroupPermissions({
    owner,
    guest,
    outsider: client(),
    draft,
    initial: row,
    travelerId: traveler.id,
  });
  record(
    "Live database role suite passed: Viewer denial, no self-promotion, owner-route/table bypass blocked, assigned-day edits allowed, both move dates checked, unauthorized mixed writes rolled back, Editor grants/retries/stale writes/demotion enforced",
  );
  await verifyGroupPermissionScreens({
    base: site,
    title: draft.title,
    event: row.content.events[0],
    ownerLogin: { email: a.email, password: a.password },
    guestLogin: { email: qa.email, password: qa.password },
  });
  record(
    "Independent desktop owner/mobile traveler UI sessions passed promotion, live role refresh, Editor save and demotion/denied edit",
  );
  row = check(await owner.rpc("read_invited_trip", { p_trip: tripId }));
  const granted = { ...draft, ...structuredClone(row.content) };
  granted.members.find((m) => m.id === traveler.id).role = "Editor";
  row = check(
    await owner.rpc("save_trip_bundle_with_timezones", {
      p_trip_id: tripId,
      p_expected_revision: row.revision,
      p_request_id: randomUUID(),
      p_data: granted,
      p_destination_timezones: draft.destinationTimezones,
    }),
  );
  const data = { ...draft, ...row.content };
  data.members.find((m) => m.id === traveler.id).status = "removed";
  check(
    await owner.rpc("save_trip_bundle_with_timezones", {
      p_trip_id: tripId,
      p_expected_revision: row.revision,
      p_request_id: randomUUID(),
      p_data: data,
      p_destination_timezones: draft.destinationTimezones,
    }),
  );
  assert.ok((await guest.rpc("read_invited_trip", { p_trip: tripId })).error);
  assert.equal(
    (
      await guest.rpc("save_invited_preferences", {
        p_trip: tripId,
        p_answers: row.content.prefs[traveler.id],
      })
    ).error?.code,
    "42501",
  );
  assert.equal(
    (
      await guest.rpc("save_shared_trip_changes", {
        p_trip_id: tripId,
        p_expected_revision: row.revision,
        p_request_id: randomUUID(),
        p_data: data,
      })
    ).error?.code,
    "42501",
  );
  record(
    "Removal revoked the existing Editor session: trip reads, shared writes and preference writes denied by the live backend",
  );
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    const p = pages.at(-1);
    if (p) {
      await p.screenshot({ path: out + "/failure.png", fullPage: true });
      writeFileSync(out + "/failure.txt", await p.locator("body").innerText());
    }
  }
  evidence.error = String(error.message).replace(
    /([?&](?:trip_token|access_token|refresh_token|token_hash|token|ticket|code)=)[^&\s]+/g,
    "$1[redacted]",
  );
  throw Error(evidence.error);
} finally {
  if (browser) await browser.close();
  check(
    await owner
      .from("trip")
      .delete()
      .eq("tripID", tripId)
      .eq("owner_id", a.userId),
  );
  await guest.auth.signOut();
  await owner.auth.signOut();
  evidence.cleanup = true;
  writeFileSync(out + "/summary.json", JSON.stringify(evidence, null, 2));
}
