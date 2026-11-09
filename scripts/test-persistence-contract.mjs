/** Hosted save-contract regression. Uses disposable users/trips, sends no email,
 * and removes every fixture. Run with node --experimental-strip-types. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { saveAccountTrip, tripFromRow } from "../src/account-trips.ts";

const env = {
  ...Object.fromEntries(
    [".env.local", ".env.server.local"].flatMap((file) =>
      existsSync(file)
        ? Object.entries(parseEnv(readFileSync(file, "utf8")))
        : [],
    ),
  ),
  ...process.env,
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
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
const check = (result) => {
  if (result.error) throw Error(result.error.message);
  return result.data;
};
let checks = 0;
const verify = (label, assertion) => {
  assertion();
  checks++;
  console.log("PASS " + label);
};
const credit = (label) => ({
  source: "unsplash",
  photographer_name: "QA " + label,
  photographer_profile_url: "https://unsplash.com/@qa-" + label,
  photo_url: "https://unsplash.com/photos/qa-" + label,
});
try {
  for (const name of ["Owner", "Editor"]) {
    const email = `save-contract-${randomUUID()}@example.com`,
      password = randomUUID();
    const { user } = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "Contract " + name },
      }),
    );
    const account = {
      id: user.id,
      email,
      name: "Contract " + name,
      client: client(),
    };
    accounts.push(account);
    check(await account.client.auth.signInWithPassword({ email, password }));
  }
  const [owner, editor] = accounts;
  const preference = {
    diet: ["Vegetarian"],
    food: "Local food",
    spending: "Moderate",
    dining: "Casual & simple",
    atmosphere: "Quiet",
    access: [],
    walk: 1000,
    interests: ["Museums"],
    destinations: "Old town",
    tickets: "Happy to book ahead",
    notes: "QA",
  };
  const draft = () => ({
    id: randomUUID(),
    title: "Save contract QA",
    destinations: ["Taipei"],
    destinationTimezones: ["Asia/Taipei"],
    start: "2027-01-01",
    end: "2027-01-02",
    zone: "Asia/Taipei",
    image: "https://images.unsplash.com/qa-a",
    imageSource: "unsplash",
    imageCredit: {
      name: "QA a",
      profileUrl: credit("a").photographer_profile_url,
      photoUrl: credit("a").photo_url,
    },
    persistence: "account",
    budget: 10000,
    budgetMode: "group",
    members: [
      {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: "Owner",
        status: "accepted",
        days: [],
      },
    ],
    events: [
      {
        id: randomUUID(),
        name: "Museum",
        place: "National museum",
        date: "2027-01-01",
        start: "10:00",
        end: "11:00",
        cost: 100,
        notes: "Original",
        image: "",
        attendees: [owner.id],
        point: { lat: 25, lng: 121 },
        googlePlaceId: "qa-place",
      },
    ],
    expenses: [
      {
        id: randomUUID(),
        purpose: "Tickets",
        amount: 100,
        category: "Activities",
        payer: owner.id,
        shares: { [owner.id]: 100 },
        date: "2027-01-01",
        source: "Manual",
        settled: [],
      },
    ],
    prefs: { [owner.id]: preference },
    individual: { [owner.id]: 10000 },
    todos: [
      {
        id: randomUUID(),
        text: "Bring tickets",
        date: "2027-01-01",
        done: false,
      },
    ],
    dismissed: ["qa-suggestion"],
  });
  const payload = (row) => ({
    ...structuredClone(row.content),
    id: row.tripID,
    title: row.trip_name,
    destinations: [...row.destinations],
    start: row.start_date,
    end: row.end_date,
    zone: row.timezone,
  });
  const read = async (id) =>
    check(await owner.client.rpc("load_trip_bundles")).find(
      (row) => row.tripID === id,
    );
  const save = (data, revision, photo = null, actor = owner) =>
    actor.client.rpc("save_account_trip", {
      p_trip_id: data.id,
      p_expected_revision: revision,
      p_request_id: randomUUID(),
      p_data: data,
      p_photo_credit: photo,
    });
  const legacy = (data, revision) =>
    owner.client.rpc("save_trip_bundle", {
      p_trip_id: data.id,
      p_expected_revision: revision,
      p_request_id: randomUUID(),
      p_data: data,
    });

  // Exercise the application writer, not a test-only approximation of its DTO.
  const original = draft();
  const saved = await saveAccountTrip(owner.client, owner, original);
  let row = await read(saved.id);
  verify("actual app writer confirms all current planning collections", () => {
    for (const key of [
      "events",
      "expenses",
      "prefs",
      "individual",
      "todos",
      "dismissed",
    ])
      assert.deepEqual(saved[key], original[key]);
    assert.deepEqual(saved.destinationTimezones, original.destinationTimezones);
    assert.deepEqual(saved.imageCredit, original.imageCredit);
    assert.deepEqual(row.photoCredit, credit("a"));
  });
  const retry = await saveAccountTrip(owner.client, owner, original);
  verify("exact app retry does not increment revision", () =>
    assert.equal(retry.revision, saved.revision),
  );

  const rejected = async (label, mutate, photo = null) => {
    const before = await read(saved.id),
      proposed = payload(before);
    mutate(proposed);
    const response = await save(proposed, before.revision, photo);
    assert.ok(response.error, label + " must be rejected");
    assert.deepEqual(
      await read(saved.id),
      before,
      label + " must roll back all data",
    );
    checks++;
    console.log("PASS " + label + " rejects without changing data");
  };
  for (const [label, mutate] of [
    [
      "unknown trip field",
      (d) => {
        d.futureField = "unsupported";
      },
    ],
    [
      "unknown event field",
      (d) => {
        d.events[0].futureField = "unsupported";
      },
    ],
    [
      "unknown traveler field",
      (d) => {
        d.members[0].futureField = "unsupported";
      },
    ],
    [
      "unknown expense field",
      (d) => {
        d.expenses[0].futureField = "unsupported";
      },
    ],
    [
      "unknown preference field",
      (d) => {
        d.prefs[owner.id].futureField = "unsupported";
      },
    ],
    [
      "unknown reminder field",
      (d) => {
        d.todos[0].futureField = "unsupported";
      },
    ],
    [
      "unknown map point field",
      (d) => {
        d.events[0].point.futureField = "unsupported";
      },
    ],
    [
      "null timezone list",
      (d) => {
        d.destinationTimezones = null;
      },
    ],
    [
      "partial timezone list",
      (d) => {
        d.destinations.push("Tokyo");
      },
    ],
    [
      "invalid timezone",
      (d) => {
        d.destinationTimezones = ["Invalid/Zone"];
      },
    ],
  ])
    await rejected(label, mutate);
  await rejected(
    "invalid photo metadata with itinerary edit",
    (d) => {
      d.events[0].notes = "Must roll back";
    },
    { source: "unsplash" },
  );
  await rejected("unknown photo metadata field", () => {}, {
    ...credit("a"),
    futureField: "unsupported",
  });

  row = await read(saved.id);
  const beforeZones = structuredClone(row);
  const mismatch = await owner.client.rpc("save_trip_bundle_with_timezones", {
    p_trip_id: saved.id,
    p_expected_revision: row.revision,
    p_request_id: randomUUID(),
    p_data: payload(row),
    p_destination_timezones: ["America/New_York"],
  });
  verify("legacy side parameter cannot bypass canonical payload", () =>
    assert.ok(mismatch.error),
  );
  assert.deepEqual(await read(saved.id), beforeZones);
  const zoneEdit = payload(row);
  zoneEdit.destinationTimezones = ["America/New_York"];
  const staleZone = await save(zoneEdit, row.revision - 1);
  verify("timezone-only change respects stale revision", () =>
    assert.equal(staleZone.error?.code, "PT409"),
  );

  // Older writers lack timezone arrays: append/reorder/removal stay aligned by place.
  let older = payload(row);
  delete older.destinationTimezones;
  older.destinations.push("Tokyo");
  row = check(await legacy(older, row.revision));
  verify("legacy append produces a complete aligned list", () =>
    assert.deepEqual(row.content.destinationTimezones, ["Asia/Taipei", null]),
  );
  let known = payload(row);
  known.destinationTimezones = ["Asia/Taipei", "Asia/Tokyo"];
  row = check(await save(known, row.revision));
  older = payload(row);
  delete older.destinationTimezones;
  older.destinations = ["Tokyo", "Taipei"];
  older.zone = "Asia/Tokyo";
  row = check(await legacy(older, row.revision));
  verify("legacy reorder preserves zones by destination identity", () =>
    assert.deepEqual(row.content.destinationTimezones, [
      "Asia/Tokyo",
      "Asia/Taipei",
    ]),
  );
  older = payload(row);
  delete older.destinationTimezones;
  older.destinations = ["Taipei"];
  older.zone = "Asia/Taipei";
  row = check(await legacy(older, row.revision));
  verify("legacy removal discards obsolete timezone rows", () =>
    assert.deepEqual(row.content.destinationTimezones, ["Asia/Taipei"]),
  );

  const emptyLegacy = payload(row);
  emptyLegacy.destinationTimezones = [];
  row = check(await legacy(emptyLegacy, row.revision));
  verify("empty legacy timezone list preserves known destination zone", () =>
    assert.deepEqual(row.content.destinationTimezones, ["Asia/Taipei"]),
  );

  // A credit-only change must advance revision; retries must not overwrite a newer image.
  const unchanged = payload(row),
    prior = row.revision;
  row = check(await save(unchanged, prior, credit("b")));
  verify("photo metadata participates in revision", () => {
    assert.ok(row.revision > prior);
    assert.deepEqual(row.photoCredit, credit("b"));
  });
  const repeated = check(await save(unchanged, prior, credit("b")));
  verify("exact atomic retry is idempotent", () =>
    assert.equal(repeated.revision, row.revision),
  );
  const next = payload(row);
  next.image = "https://images.unsplash.com/qa-c";
  row = check(await save(next, row.revision, credit("c")));
  const stalePhoto = await save(unchanged, prior, credit("b"));
  verify("old photo retry cannot replace newer image attribution", () =>
    assert.equal(stalePhoto.error?.code, "PT409"),
  );
  const rawCredit = await owner.client
    .from("trip_photo_credit")
    .upsert({ trip_id: row.tripID, owner_id: owner.id, ...credit("wrong") });
  verify("legacy separate attribution write is blocked", () =>
    assert.ok(rawCredit.error),
  );
  const afterCredit = await read(row.tripID);
  assert.equal(afterCredit.content.image, next.image);
  assert.deepEqual(afterCredit.photoCredit, credit("c"));

  const raceA = payload(row),
    raceB = payload(row);
  raceA.image = "https://images.unsplash.com/qa-race-a";
  raceB.image = "https://images.unsplash.com/qa-race-b";
  const race = await Promise.all([
    save(raceA, row.revision, credit("race-a")),
    save(raceB, row.revision, credit("race-b")),
  ]);
  verify("concurrent image and attribution writes have one winner", () => {
    assert.equal(race.filter((result) => !result.error).length, 1);
    assert.equal(race.find((result) => result.error).error.code, "PT409");
  });
  row = await read(row.tripID);
  const winner = race.find((result) => !result.error).data;
  verify("winning image and attribution remain paired", () => {
    assert.equal(row.content.image, winner.content.image);
    assert.deepEqual(row.photoCredit, winner.photoCredit);
    assert.equal(
      row.photoCredit.photographer_name,
      row.content.image.endsWith("race-a") ? "QA race-a" : "QA race-b",
    );
  });
  // Restore known attribution for the following collaborator round-trip assertion.
  const restored = payload(row);
  restored.image = "https://images.unsplash.com/qa-c";
  row = check(await save(restored, row.revision, credit("c")));

  // Read while another request commits changes. Every observed bundle must pair
  // root title, event notes, image and credit from the same logical revision.
  let writerDone = false;
  let coherentReads = 0;
  const coherent = (observed) => {
    if (!observed.trip_name.startsWith("Snapshot ")) return;
    const marker = observed.trip_name.slice("Snapshot ".length);
    assert.equal(observed.content.events[0].notes, marker);
    assert.equal(
      observed.content.image,
      "https://images.unsplash.com/qa-snapshot-" + marker,
    );
    assert.equal(
      observed.photoCredit.photographer_name,
      "QA snapshot-" + marker,
    );
    coherentReads++;
  };
  await Promise.all([
    (async () => {
      try {
        for (let index = 0; index < 8; index++) {
          const changed = payload(row),
            marker = String(index);
          changed.title = "Snapshot " + marker;
          changed.events[0].notes = marker;
          changed.image = "https://images.unsplash.com/qa-snapshot-" + marker;
          row = check(
            await save(changed, row.revision, credit("snapshot-" + marker)),
          );
          coherent(row);
        }
      } finally {
        writerDone = true;
      }
    })(),
    (async () => {
      do {
        coherent(await read(row.tripID));
      } while (!writerDone);
    })(),
  ]);
  verify("concurrent readers receive coherent complete bundles", () =>
    assert.ok(coherentReads >= 8),
  );
  const finalPhoto = payload(row);
  finalPhoto.image = "https://images.unsplash.com/qa-c";
  row = check(await save(finalPhoto, row.revision, credit("c")));

  // Existing-account linking is an RPC-only fixture; do not invoke email delivery.
  check(
    await owner.client.rpc("share_trip_recipient", {
      p_trip: row.tripID,
      p_email: editor.email,
      p_delivered: false,
    }),
  );
  row = await read(row.tripID);
  const grant = payload(row);
  grant.members.find((member) => member.accountId === editor.id).role =
    "Editor";
  row = check(await save(grant, row.revision));
  const guestTrip = tripFromRow(row, editor);
  guestTrip.events[0].notes = "Independent Editor saved";
  const guestSaved = await saveAccountTrip(editor.client, editor, guestTrip);
  verify(
    "actual collaborator writer preserves owner root and photo metadata",
    () => {
      assert.equal(guestSaved.events[0].notes, "Independent Editor saved");
      assert.deepEqual(
        guestSaved.destinationTimezones,
        row.content.destinationTimezones,
      );
      assert.deepEqual(guestSaved.imageCredit, {
        name: "QA c",
        profileUrl: credit("c").photographer_profile_url,
        photoUrl: credit("c").photo_url,
      });
    },
  );
  row = await read(row.tripID);
  const forbidden = payload(row);
  forbidden.futureField = "unsupported";
  const unknownShared = await editor.client.rpc("save_shared_trip_changes", {
    p_trip_id: row.tripID,
    p_expected_revision: row.revision,
    p_request_id: randomUUID(),
    p_data: forbidden,
  });
  verify("collaborator contract rejects unknown fields too", () =>
    assert.ok(unknownShared.error),
  );
  assert.deepEqual(await read(row.tripID), row);
  const guestOwnerRoute = await save(payload(row), row.revision, null, editor);
  verify("atomic owner endpoint rejects collaborators", () =>
    assert.equal(guestOwnerRoute.error?.code, "42501"),
  );
  const anonymous = await client().rpc("save_account_trip", {
    p_trip_id: row.tripID,
    p_expected_revision: row.revision,
    p_request_id: randomUUID(),
    p_data: payload(row),
    p_photo_credit: null,
  });
  verify("atomic endpoint rejects anonymous callers", () =>
    assert.ok(anonymous.error),
  );
  console.log(`${checks} live save-contract checks passed.`);
} finally {
  const errors = [];
  for (const account of accounts) {
    try {
      check(await account.client.auth.signOut({ scope: "global" }));
      check(await admin.from("trip").delete().eq("owner_id", account.id));
      check(await admin.from("user").delete().eq("userID", account.id));
      check(await admin.auth.admin.deleteUser(account.id));
      assert.deepEqual(
        check(
          await admin.from("trip").select("tripID").eq("owner_id", account.id),
        ),
        [],
      );
      assert.deepEqual(
        check(
          await admin.from("user").select("userID").eq("userID", account.id),
        ),
        [],
      );
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length)
    throw Error("QA cleanup needs attention: " + errors.join("; "));
  console.log(
    "All disposable contract accounts and trips removed; no email sent.",
  );
}
