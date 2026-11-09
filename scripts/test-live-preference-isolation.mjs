/** Real owner/collaborator preference isolation; no email is sent. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const a = JSON.parse(
  readFileSync(
    process.env.QA_ACCOUNT_FILE || "../live-destination-qa/account.local.json",
  ),
);
const q = JSON.parse(
  readFileSync(
    process.env.QA_COLLABORATOR_FILE ||
      "../live-destination-qa/inbox-collaborator.local.json",
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
check(
  await owner.auth.signInWithPassword({ email: a.email, password: a.password }),
);
check(
  await guest.auth.signInWithPassword({ email: q.email, password: q.password }),
);
const id = randomUUID();
const answers = {
  diet: ["Vegetarian"],
  food: "A little of both",
  spending: "Moderate",
  dining: "A mix of both",
  atmosphere: "Quiet",
  access: [],
  walk: 1000,
  interests: ["Art"],
  destinations: "Museums",
  tickets: "Happy to book ahead",
  notes: "Owner original",
};
const draft = {
  id,
  title: "Preference isolation QA",
  destinations: ["London"],
  destinationTimezones: ["Europe/London"],
  start: "2027-01-01",
  end: "2027-01-02",
  zone: "Europe/London",
  image: "",
  members: [
    {
      id: a.userId,
      name: "QA Owner",
      email: a.email,
      role: "Owner",
      days: [],
      status: "accepted",
    },
  ],
  events: [],
  expenses: [],
  prefs: { [a.userId]: answers },
  individual: {},
  todos: [],
  dismissed: [],
  budget: null,
  budgetMode: "group",
};
const evidence = {
  checkedAt: new Date().toISOString(),
  checks: [],
  cleanup: false,
};
const out =
  "/Users/drew/Documents/Codex/2026-10-28/i-x20/outputs/live-preference-isolation-2026-11-08";
mkdirSync(out, { recursive: true });
try {
  check(
    await owner.rpc("save_trip_bundle_with_timezones", {
      p_trip_id: id,
      p_expected_revision: null,
      p_request_id: randomUUID(),
      p_data: draft,
      p_destination_timezones: draft.destinationTimezones,
    }),
  );
  check(
    await owner.rpc("share_trip_recipient", {
      p_trip: id,
      p_email: q.email,
      p_delivered: false,
    }),
  );
  let row = check(await guest.rpc("read_invited_trip", { p_trip: id }));
  const me = row.content.members.find((m) => m.accountId === q.userId);
  assert.ok(me);
  assert.equal(me.role, "Viewer");
  check(
    await guest.rpc("save_invited_preferences", {
      p_trip: id,
      p_answers: { ...answers, notes: "Collaborator own answers" },
    }),
  );
  row = check(await owner.rpc("read_invited_trip", { p_trip: id }));
  assert.equal(row.content.prefs[me.id].notes, "Collaborator own answers");
  assert.equal(row.content.prefs[a.userId].notes, "Owner original");
  evidence.checks.push(
    "Real Viewer saved its own answers; independent owner read confirmed both participants answers",
  );
  const bad = { ...draft, ...structuredClone(row.content) };
  bad.prefs[a.userId].notes = "Forbidden overwrite";
  assert.equal(
    (
      await guest.rpc("save_shared_trip_changes", {
        p_trip_id: id,
        p_expected_revision: row.revision,
        p_request_id: randomUUID(),
        p_data: bad,
      })
    ).error?.code,
    "42501",
  );
  const after = check(await owner.rpc("read_invited_trip", { p_trip: id }));
  assert.equal(after.revision, row.revision);
  assert.deepEqual(after.content, row.content);
  evidence.checks.push(
    "Viewer overwrite of owner preferences was rejected with unchanged revision and complete content",
  );
  assert.equal(
    (
      await guest.rpc("save_invited_preferences", {
        p_trip: randomUUID(),
        p_answers: answers,
      })
    ).error?.code,
    "42501",
  );
  evidence.checks.push(
    "Authenticated account could not save preferences to an unrelated trip",
  );
} finally {
  check(
    await owner.from("trip").delete().eq("tripID", id).eq("owner_id", a.userId),
  );
  await owner.auth.signOut();
  await guest.auth.signOut();
  evidence.cleanup = true;
  writeFileSync(out + "/summary.json", JSON.stringify(evidence, null, 2));
}
console.log(evidence);
