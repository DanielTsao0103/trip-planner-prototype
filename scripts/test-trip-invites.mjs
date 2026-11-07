/** Opt-in hosted integration check. Uses disposable accounts and generates an invite link without sending mail. */
import assert from "node:assert/strict";
import { verifyGroupPermissions, verifyGroupPermissionScreens } from "./test-group-permissions.mjs";
import { verifyInvitationRouting } from "./test-invitation-routing.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

const env = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...parseEnv(readFileSync(".env.server.local", "utf8")),
};
const client = (key) =>
  createClient(env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(env.SUPABASE_SECRET_KEY);
const owner = client(env.VITE_SUPABASE_PUBLISHABLE_KEY);
const guest = client(env.VITE_SUPABASE_PUBLISHABLE_KEY);
const check = (response) => {
  if (response.error) throw new Error(response.error.message);
  return response.data;
};
const tripId = randomUUID();
const accountIds = [];
const tripIds = [tripId];
const makeEmail = () => `trip-invite-qa-${randomUUID()}@example.com`;

try {
  const email = makeEmail();
  const password = randomUUID();
  const { user } = check(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "QA Owner" },
    }),
  );
  accountIds.push(user.id);
  check(await owner.auth.signInWithPassword({ email, password }));
  const draft = {
    id: tripId,
    title: "Invitation QA",
    destinations: ["Taipei"],
    start: "2027-01-01",
    end: "2027-01-02",
    zone: "Asia/Taipei",
    image: "test",
    budget: null,
    budgetMode: "group",
    members: [
      {
        id: user.id,
        name: "QA Owner",
        email,
        role: "Owner",
        status: "accepted",
        days: [],
      },
    ],
    events: [
      {
        id: randomUUID(),
        name: "Museum entrance",
        place: "221B Baker Street, London",
        point: { lat: 51.52376, lng: -0.15847 },
        date: "2027-01-01",
        start: "10:00",
        end: "11:00",
        cost: 0,
        notes: "",
        image: "",
        attendees: [user.id],
      },
    ],
    expenses: [],
    prefs: {},
    individual: {},
    todos: [],
    dismissed: [],
  };
  const save = (content, revision) =>
    owner.rpc("save_trip_bundle", {
      p_trip_id: tripId,
      p_expected_revision: revision,
      p_request_id: randomUUID(),
      p_data: content,
    });
  check(await save(draft, null));
  const recipient = makeEmail();
  const share = (delivered = false) =>
    owner.rpc("share_trip_recipient", {
      p_trip: tripId,
      p_email: recipient,
      p_delivered: delivered,
    });
  assert.equal(check(await share()), "needs_email");
  const target = "https://danieltsao0103.github.io/trip-planner-prototype/";
  const invitation = check(
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: recipient,
      options: {
        redirectTo: target + "?trip_invite=" + tripId,
        data: { trip_account_setup: true },
      },
    }),
  );
  accountIds.push(invitation.user.id);
  assert.equal(check(await share(true)), "sent");
  const first = await fetch(invitation.properties.action_link, {
    redirect: "manual",
  });
  const destination = new URL(first.headers.get("location"));
  const tokens = new URLSearchParams(destination.hash.slice(1));
  assert.ok(["magiclink", "signup"].includes(tokens.get("type")));
  if (process.env.INVITE_BROWSER_URL) {
    // Exercise the actual redirect payload against a local build or the published site.
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    const useInvitedEmail = process.env.INVITE_SAME_EMAIL === "1";
    const selectedEmail = useInvitedEmail ? recipient : makeEmail();
    try {
      const base = new URL(process.env.INVITE_BROWSER_URL);
      assert.ok(
        base.hostname === "127.0.0.1" || base.origin + base.pathname === target,
      );
      assert.equal(destination.searchParams.get("trip_invite"), tripId);
      base.search = destination.search;
      base.hash = destination.hash;
      const page = await browser.newPage({
        viewport: { width: useInvitedEmail ? 390 : 1280, height: 850 },
      });
      await page.goto(base.href);
      await page.getByRole("button", { name: "Sign in with Google" }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Create account", exact: true }).waitFor();
      await page.getByLabel("Your name").fill("Browser Traveler");
      await page.getByLabel("Email", { exact: true }).fill(selectedEmail);
      const browserPassword = randomUUID();
      await page.getByLabel("Password", { exact: true }).fill(browserPassword);
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page
        .getByText("Joined Invitation QA", { exact: true })
        .waitFor({ timeout: 12000 })
        .catch(async () => {
          throw Error(
            "Survey did not open: " +
              (await page.getByRole("alert").allTextContents()),
          );
        });
      const selected = check(
        await guest.auth.signInWithPassword({
          email: selectedEmail,
          password: browserPassword,
        }),
      );
      if (!useInvitedEmail) accountIds.push(selected.user.id);
      await page.getByRole("button", { name: "Save and open trip" }).click();
      await page
        .getByRole("heading", { name: "Invitation QA", exact: true })
        .first()
        .waitFor();
      const row = check(
        await owner.rpc("read_invited_trip", { p_trip: tripId }),
      );
      const traveler = row.content.members.find(
        (m) => m.accountId === selected.user.id,
      );
      assert.ok(traveler && row.content.prefs[traveler.id]);
      console.log(
        "Verified shared login, signup, invited trip, and saved survey (" +
          (useInvitedEmail
            ? "invited email/mobile"
            : "alternate email/desktop") +
          ").",
      );
    } finally {
      await browser.close();
    }
  } else {
    check(
      await guest.auth.setSession({
        access_token: tokens.get("access_token"),
        refresh_token: tokens.get("refresh_token"),
      }),
    );
    const ticket = check(
      await guest.rpc("open_trip_invite", { p_trip: tripId }),
    );
    assert.equal(ticket.canSetup, true);
    assert.equal(ticket.accountId ?? null, null);
    assert.equal(ticket.trip, tripId);
    assert.equal(ticket.email, recipient);
    assert.equal(check(await guest.rpc("load_trip_bundles")).length, 0);
    const newEmail = makeEmail();
    const newPassword = randomUUID();
    const signed = check(
      await guest.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: { data: { name: "Invited Traveler" } },
      }),
    );
    accountIds.push(signed.user.id);
    assert.ok(signed.session);
    assert.ok((await guest.rpc("open_trip_invite", { p_trip: tripId })).error);
    const accept = (client, secret) =>
      client.rpc("accept_trip_invite", { p_trip: tripId, p_ticket: secret });
    assert.ok((await accept(guest, randomUUID())).error);
    check(await accept(guest, ticket.ticket));
    check(await accept(guest, ticket.ticket)); // safe after a lost acknowledgement
    assert.ok((await accept(owner, ticket.ticket)).error);
    const formerInbox = client(env.VITE_SUPABASE_PUBLISHABLE_KEY);
    check(
      await formerInbox.auth.setSession({
        access_token: tokens.get("access_token"),
        refresh_token: tokens.get("refresh_token"),
      }),
    );
    assert.ok((await accept(formerInbox, ticket.ticket)).error);
    assert.ok(
      check(await guest.rpc("load_trip_bundles")).some(
        (t) => t.tripID === tripId,
      ),
    );
    const row = check(await guest.rpc("read_invited_trip", { p_trip: tripId }));
    assert.deepEqual(row.content.events[0].point, draft.events[0].point);
    assert.equal(row.content.members.length, 2);
    assert.equal(row.content.members[1].name, "Invited Traveler");
    assert.equal(row.content.members[1].accountId, signed.user.id);
    assert.ok(
      (
        await guest.rpc("share_trip_recipient", {
          p_trip: tripId,
          p_email: makeEmail(),
        })
      ).error,
    );
    const traveler = row.content.members.find(
      (m) => m.accountId === signed.user.id,
    );
    assert.notEqual(traveler.id, invitation.user.id);
    const answers = {
      diet: ["Vegan"],
      food: "Local favorites",
      spending: "Moderate",
      dining: "Casual & simple",
      atmosphere: "Quiet",
      access: [],
      walk: 450,
      interests: ["History"],
      destinations: "",
      tickets: "Happy to book ahead",
      notes: "Test survey",
    };
    const submit = (client, prefs = answers) =>
      client.rpc("save_invited_preferences", {
        p_trip: tripId,
        p_answers: prefs,
      });
    assert.ok((await submit(owner)).error);
    const submitted = check(await submit(guest));
    assert.deepEqual(submitted.content.prefs, { [traveler.id]: answers });
    assert.ok((await submit(guest, { ...answers, walk: -1 })).error);
    assert.deepEqual(
      check(await owner.rpc("read_invited_trip", { p_trip: tripId })).content
        .prefs,
      submitted.content.prefs,
    );
    assert.equal((await save(draft, row.revision)).error?.code, "PT409");
    draft.prefs = submitted.content.prefs;
    draft.members = row.content.members;
    draft.title = "Edited after sharing";
    draft.events[0].point = { lat: 51.523748, lng: -0.1585699 };
    const edited = check(await save(draft, submitted.revision));
    const shared = check(
      await guest.rpc("read_invited_trip", { p_trip: tripId }),
    );
    assert.deepEqual(shared.content.events[0].point, draft.events[0].point);
    const invalid = structuredClone(draft);
    invalid.events[0].point.lat = 91;
    assert.ok((await save(invalid, edited.revision)).error);
    const olderClient = structuredClone(draft);
    delete olderClient.events[0].point;
    const preserved = check(await save(olderClient, edited.revision));
    assert.deepEqual(preserved.content.events[0].point, draft.events[0].point);
    draft.events[0].point = null;
    assert.ok(
      check(await guest.rpc("load_trip_bundles")).some(
        (t) => t.tripID === tripId,
      ),
    );
    let afterRoleChecks = await verifyGroupPermissions({
      owner, guest, outsider: formerInbox, draft, initial: preserved, travelerId: traveler.id,
    });
    if (process.env.GROUP_BROWSER_URL) {
      const base = new URL(process.env.GROUP_BROWSER_URL);
      assert.ok(base.hostname === "127.0.0.1" || base.href === target);
      await verifyGroupPermissionScreens({
        base: base.href, title: draft.title, event: afterRoleChecks.content.events[0],
        ownerLogin: { email, password }, guestLogin: { email: newEmail, password: newPassword },
      });
      afterRoleChecks = check(await owner.rpc("read_invited_trip", { p_trip: tripId }));
      assert.equal(afterRoleChecks.content.events[0].notes, "Confirmed from a separate traveler session");
    }
    Object.assign(draft, afterRoleChecks.content);
    draft.events[0].point = null;
    draft.members.find((m) => m.id === traveler.id).status = "removed";
    assert.equal(
      check(await save(draft, afterRoleChecks.revision)).content.events[0].point,
      null,
    );
    assert.ok((await guest.rpc("read_invited_trip", { p_trip: tripId })).error);
    assert.equal((await submit(guest)).error?.code, "42501");
    const removedWrite = await guest.rpc("save_shared_trip_changes", {
      p_trip_id: tripId, p_request_id: randomUUID(), p_expected_revision: afterRoleChecks.revision, p_data: draft,
    });
    assert.equal(removedWrite.error?.code, "42501", "A removed member cannot write with their old session");
    console.log(
      "Account setup, shared pin creation and correction, survey persistence, stale owner edits, and access revocation passed.",
    );
    assert.equal(
      destination.origin + destination.pathname,
      target,
      "Add the published app URL to Supabase Auth redirect URLs.",
    );
  }
  await verifyInvitationRouting({ admin, owner, client: () => client(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    tripIds, accountIds, ownerAccount: user, target, outsider: guest });
} finally {
  for (const id of tripIds) check(await admin.from("trip").delete().eq("tripID", id));
  for (const id of accountIds) {
    check(await admin.from("user").delete().eq("userID", id));
    check(await admin.auth.admin.deleteUser(id));
  }
}
