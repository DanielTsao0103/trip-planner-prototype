import { test } from "node:test";
import assert from "node:assert/strict";
import { TripRecoveryJournal } from "./trip-recovery.ts";
import { storage, lockManager, pending } from "./trip-recovery-test-support.ts";

function fixture() {
  const local = storage(),
    locks = lockManager();
  const journal = (writer: string, session = storage()) =>
    new TripRecoveryJournal(local, session, "owner", writer, locks);
  return { local, journal };
}

test("a corrupted draft is quarantined in place instead of entering application state", async () => {
  const { local, journal } = fixture();
  const good = pending("good").get("good")!;
  const raw = JSON.stringify({
    draft: { id: "bad", members: good.draft.members, events: null },
    updated: 2,
  });
  const key = "trip-planner-pending-v2:owner:old:bad:1";
  local.setItem(key, raw);
  const valid = journal("valid");
  await valid.start();
  valid.sync(pending("good"));
  valid.close();
  const reopened = journal("reopened");
  assert.deepEqual(
    (await reopened.read()).map((entry) => entry.draft.id),
    ["good"],
  );
  assert.equal(reopened.rejected[0].raw, raw);
  assert.equal(local.getItem(key), raw);
  reopened.close();
});

test("a retry snapshot for another trip cannot be replayed as this trip's write", async () => {
  const { local, journal } = fixture();
  const draft = pending("first").get("first")!.draft;
  const retryDraft = pending("different").get("different")!.draft;
  local.setItem(
    "trip-planner-pending-v2:owner:old:first:1",
    JSON.stringify({
      draft,
      retryDraft: { draft: retryDraft, generation: 1 },
      updated: 1,
    }),
  );
  const reopened = journal("reopened");
  assert.deepEqual(await reopened.read(), []);
  assert.equal(reopened.rejected.length, 1);
  reopened.close();
});

test("malformed retry generations never enter the write queue", async () => {
  for (const generation of [
    "not-a-number",
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const { local, journal } = fixture();
    const draft = pending("first").get("first")!.draft;
    local.setItem(
      "trip-planner-pending-v2:owner:old:first:1",
      JSON.stringify({
        draft,
        retryDraft: { draft, generation },
        updated: 1,
      }),
    );
    const reopened = journal("reopened");
    assert.deepEqual(await reopened.read(), []);
    assert.equal(reopened.rejected.length, 1);
    reopened.close();
  }
});

test("discard in a second tab cannot erase an active original tab's recovery", async () => {
  const { journal } = fixture();
  const originalSession = storage();
  const original = journal("original", originalSession);
  await original.start();
  original.sync(pending("trip", "Still unsaved in original tab"));
  const second = journal("second");
  assert.deepEqual(await second.read(), []);
  assert.equal(second.ignoredActiveWriters, 1);
  second.discard(["trip"]);
  original.close();
  second.close();
  const reopenedOriginal = journal("original-reload", originalSession);
  assert.equal(
    (await reopenedOriginal.read())[0]?.draft.title,
    "Still unsaved in original tab",
  );
  reopenedOriginal.close();
});

test("enumeration does not skip the next trip when the first record disappears", async () => {
  const { local, journal } = fixture();
  const a = journal("a"),
    b = journal("b");
  await a.start();
  await b.start();
  a.sync(pending("first"));
  b.sync(pending("second"));
  a.close();
  b.close();
  const firstKey = local.key(0)!;
  const getItem = local.getItem;
  local.getItem = (key) => {
    const value = getItem(key);
    if (key === firstKey) local.removeItem(firstKey);
    return value;
  };
  const reopened = journal("reopened");
  assert.ok(
    (await reopened.read()).some((entry) => entry.draft.id === "second"),
  );
  reopened.close();
});

test("unknown fields and invalid nested entities are quarantined without poisoning healthy recovery", async () => {
  const mutations = [
    (trip: Record<string, any>) => {
      trip.futureUnsupportedField = "preserve raw";
    },
    (trip: Record<string, any>) => {
      trip.events[0].attendees = null;
    },
    (trip: Record<string, any>) => {
      trip.members[0].role = "Administrator";
    },
    (trip: Record<string, any>) => {
      trip.start = "2027-02-30";
    },
    (trip: Record<string, any>) => {
      trip.events[0].point = { lat: 91, lng: 0 };
    },
    (trip: Record<string, any>) => {
      trip.prefs = { owner: { notes: "missing collections" } };
    },
    (trip: Record<string, any>) => {
      trip.todos = [
        { id: "todo", text: "Pack", date: "2027-01-01", done: "false" },
      ];
    },
    (trip: Record<string, any>) => {
      trip.members[0].id = "another-account";
    },
  ];
  for (const mutate of mutations) {
    const { local, journal } = fixture();
    const draft = pending("trip").get("trip")!.draft;
    mutate(draft);
    const raw = JSON.stringify({ draft, updated: 1 });
    local.setItem("trip-planner-pending-v2:owner:old:trip:1", raw);
    const reopened = journal("reopened");
    assert.deepEqual(await reopened.read(), []);
    assert.equal(reopened.rejected[0].raw, raw);
    reopened.close();
  }
});
