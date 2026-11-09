import { test } from "node:test";
import assert from "node:assert/strict";
import { TripRecoveryJournal } from "./trip-recovery.ts";
import { storage, lockManager, pending } from "./trip-recovery-test-support.ts";
import type { PendingTrip } from "./trip-save-queue.ts";

function fixture() {
  const local = storage(),
    locks = lockManager();
  const journal = async (
    writer: string,
    session = storage(),
    account = "owner",
  ) => {
    const value = new TripRecoveryJournal(
      local,
      session,
      account,
      writer,
      locks,
    );
    await value.start();
    return value;
  };
  return { local, locks, journal };
}

test("one tab finishing never removes another tab's interrupted trip", async () => {
  const { local, journal } = fixture();
  const a = await journal("a"),
    b = await journal("b");
  a.sync(pending("first"));
  b.sync(pending("second"));
  b.sync(new Map());
  const reopened = await journal("new");
  assert.deepEqual(await reopened.read(), []);
  assert.equal(reopened.ignoredActiveWriters, 1);
  a.close();
  assert.deepEqual(
    (await reopened.read()).map((entry) => entry.draft.id),
    ["first"],
  );
  assert.equal(local.length, 1);
  b.close();
  reopened.close();
});

test("a fresh tab discovers abandoned drafts and retires them after confirmation", async () => {
  const { local, journal } = fixture();
  const original = await journal("closed");
  original.sync(pending("first"));
  original.close();
  const reopened = await journal("new");
  const [entry] = await reopened.read();
  reopened.sync(
    new Map([[entry.draft.id, { ...entry, error: "", generation: 1 }]]),
  );
  reopened.sync(new Map());
  assert.equal(local.length, 0);
  reopened.close();
});

test("simultaneous tabs cannot both claim the same abandoned recovery", async () => {
  const { journal } = fixture();
  const source = await journal("source");
  source.sync(pending("first"));
  source.close();
  const a = await journal("a"),
    b = await journal("b");
  const [first, second] = await Promise.all([a.read(), b.read()]);
  assert.equal(first.length + second.length, 1);
  a.close();
  b.close();
});

test("reload prefers its own abandoned version and preserves a competing draft", async () => {
  const { journal } = fixture();
  const sessionA = storage();
  const a = await journal("a", sessionA),
    b = await journal("b");
  a.sync(pending("first", "Tab A"));
  b.sync(pending("first", "Tab B"));
  a.close();
  b.close();
  const reopened = await journal("a2", sessionA);
  assert.equal((await reopened.read())[0].draft.title, "Tab A");
  reopened.sync(new Map());
  reopened.close();
  const other = await journal("c");
  assert.equal((await other.read())[0].draft.title, "Tab B");
  other.close();
});

test("legacy multi-trip journals preserve exact retry snapshots during migration", async () => {
  const { local, journal } = fixture();
  const key = "trip-planner-pending-v1:owner";
  const first = pending("first").get("first")!,
    second = pending("second").get("second")!;
  first.retryDraft = {
    draft: { ...first.draft, title: "Unconfirmed write" },
    generation: 0,
  };
  local.setItem(key, JSON.stringify([first, second]));
  const reopened = await journal("new");
  assert.equal(
    (await reopened.read())[0].retryDraft?.draft.title,
    "Unconfirmed write",
  );
  reopened.sync(new Map([["second", second]]));
  assert.equal(local.getItem(key), null);
  assert.equal(local.length, 1);
  reopened.sync(new Map());
  assert.equal(local.length, 0);
  reopened.close();
});

test("journals cannot discover or delete another account's recovery", async () => {
  const { local, journal } = fixture();
  const owner = await journal("a");
  owner.sync(pending("first"));
  owner.close();
  const other = await journal("b", storage(), "other-account");
  assert.deepEqual(await other.read(), []);
  other.sync(new Map());
  assert.equal(local.length, 1);
  other.close();
});

test("repeated offline reloads retire ancestors once the replacement is durable", async () => {
  const { local, journal } = fixture();
  const session = storage();
  const first = await journal("first", session);
  first.sync(pending("trip", "Interrupted event"));
  first.close();
  const second = await journal("second", session);
  await second.read();
  second.sync(pending("trip", "Corrected event"));
  second.close();
  const third = await journal("third", session);
  assert.equal((await third.read())[0].draft.title, "Corrected event");
  third.sync(pending("trip", "Corrected event"));
  third.sync(new Map());
  assert.equal(local.length, 0);
  third.close();
});

test("explicit discard removes claimed alternatives while preserving active writers", async () => {
  const { journal } = fixture();
  const a = await journal("a"),
    b = await journal("b"),
    c = await journal("c");
  a.sync(pending("trip", "Version A"));
  b.sync(pending("trip", "Version B"));
  c.sync(pending("other-trip"));
  a.close();
  const reopened = await journal("reopened");
  await reopened.read();
  reopened.sync(pending("trip", "Own pending copy"));
  b.sync(pending("trip", "Newer version B"));
  reopened.discard(["trip"]);
  reopened.close();
  b.close();
  c.close();
  const after = await journal("after");
  assert.deepEqual(
    (await after.read()).map((entry) => entry.draft.title).sort(),
    ["Newer version B", "other-trip"],
  );
  after.close();
});

test("storage quota failure keeps the source and rejects a false durability claim", async () => {
  const { local, journal } = fixture();
  const original = await journal("original");
  original.sync(pending("trip", "Original offline edit"));
  original.close();
  const resumed = await journal("resumed");
  await resumed.read();
  const setItem = local.setItem;
  local.setItem = () => {
    throw new Error("Storage full");
  };
  assert.throws(
    () => resumed.sync(pending("trip", "Corrected edit")),
    /Storage full/,
  );
  assert.equal(local.length, 1);
  local.setItem = setItem;
  resumed.sync(pending("trip", "Corrected edit"));
  assert.equal(local.length, 1);
  resumed.close();
  const final = await journal("final");
  assert.equal((await final.read())[0].draft.title, "Corrected edit");
  final.sync(new Map());
  assert.equal(local.length, 0);
  final.close();
});

test("unsupported locks fail explicitly without touching pending recovery", async () => {
  const local = storage();
  local.setItem("unrelated", "keep");
  const journal = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "writer",
    null,
  );
  await assert.rejects(journal.start(), /cannot safely coordinate/);
  assert.throws(() => journal.sync(pending("trip")), /unavailable/);
  assert.equal(local.getItem("unrelated"), "keep");
  journal.close();
});

test("closing while lock acquisition is pending never leaves a held claim", async () => {
  const { local, locks } = fixture();
  const first = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "same",
    locks,
  );
  const starting = first.start();
  first.close();
  await assert.rejects(starting, /acquire/);
  const second = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "same",
    locks,
  );
  await second.start();
  second.close();
});
