/** Opt-in hosted integration check. Uses disposable accounts and generates an invite link without sending mail. */
import assert from "node:assert/strict";
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
    events: [],
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
      options: { redirectTo: target, data: { trip_account_setup: true } },
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
  check(
    await guest.auth.setSession({
      access_token: tokens.get("access_token"),
      refresh_token: tokens.get("refresh_token"),
    }),
  );
  check(
    await guest.auth.updateUser({
      password: randomUUID(),
      data: { name: "Invited Traveler" },
    }),
  );
  const names = check(
    await owner.rpc("resolve_trip_emails", { p_emails: [recipient] }),
  );
  assert.equal(names[recipient], "Invited Traveler");
  assert.ok(
    check(await guest.rpc("load_trip_bundles")).some(
      (t) => t.tripID === tripId,
    ),
  );
  assert.equal(check(await share()), "shared");
  const row = check(await guest.rpc("read_invited_trip", { p_trip: tripId }));
  assert.equal(row.content.members.length, 2);
  assert.equal(row.content.members[1].name, "Invited Traveler");
  assert.equal(row.content.members[1].accountId, invitation.user.id);
  assert.ok(
    (
      await guest.rpc("share_trip_recipient", {
        p_trip: tripId,
        p_email: makeEmail(),
      })
    ).error,
  );
  const traveler = row.content.members.find(m => m.accountId === invitation.user.id);
  assert.notEqual(traveler.id, invitation.user.id);
  const answers = {
    diet: ["Vegan"], food: "Local favorites", spending: "Moderate", dining: "Casual & simple",
    atmosphere: "Quiet", access: [], walk: 450, interests: ["History"], destinations: "",
    tickets: "Happy to book ahead", notes: "Test survey",
  };
  const submit = (client, prefs = answers) => client.rpc("save_invited_preferences", {
    p_trip: tripId, p_answers: prefs,
  });
  assert.ok((await submit(owner)).error);
  const submitted = check(await submit(guest));
  assert.deepEqual(submitted.content.prefs, { [traveler.id]: answers });
  assert.ok((await submit(guest, { ...answers, walk: -1 })).error);
  assert.deepEqual(check(await owner.rpc("read_invited_trip", { p_trip: tripId })).content.prefs,
    submitted.content.prefs);
  assert.equal((await save(draft, row.revision)).error?.code, "PT409");
  draft.prefs = submitted.content.prefs;
  draft.members = row.content.members;
  draft.title = "Edited after sharing";
  const edited = check(await save(draft, submitted.revision));
  assert.ok(
    check(await guest.rpc("load_trip_bundles")).some(
      (t) => t.tripID === tripId,
    ),
  );
  draft.members[1].status = "removed";
  check(await save(draft, edited.revision));
  assert.ok((await guest.rpc("read_invited_trip", { p_trip: tripId })).error);
  assert.equal((await submit(guest)).error?.code, "42501");
  console.log(
    "Account setup, sharing, survey persistence, stale owner edits, and revocation passed.",
  );
  assert.equal(
    destination.origin + destination.pathname,
    target,
    "Add the published app URL to Supabase Auth redirect URLs.",
  );
} finally {
  check(await admin.from("trip").delete().eq("tripID", tripId));
  for (const id of accountIds) {
    check(await admin.from("user").delete().eq("userID", id));
    check(await admin.auth.admin.deleteUser(id));
  }
}
