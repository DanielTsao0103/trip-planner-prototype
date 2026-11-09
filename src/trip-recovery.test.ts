import { test } from "node:test";
import assert from "node:assert/strict";
import { TripRecoveryJournal } from "./trip-recovery.ts";
import { seed } from "./data.ts";
import type { PendingTrip } from "./trip-save-queue.ts";

/** A browser-like storage fake shared by independent tab journals. */
function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}
function pending(id: string, title = id): Map<string, PendingTrip> {
  return new Map([
    [
      id,
      {
        draft: { ...structuredClone(seed().trips[0]), id, title },
        error: "",
        generation: 1,
      },
    ],
  ]);
}

test("one tab finishing never removes another tab's interrupted trip", () => {
  const local = storage();
  const a = new TripRecoveryJournal(local, storage(), "owner", "a");
  const b = new TripRecoveryJournal(local, storage(), "owner", "b");
  a.sync(pending("first"));
  b.sync(pending("second"));
  b.sync(new Map());
  const reopened = new TripRecoveryJournal(local, storage(), "owner", "new");
  assert.deepEqual(
    reopened.read().map((entry) => entry.draft.id),
    ["first"],
  );
});

test("a fresh tab discovers abandoned drafts and retires them after confirmation", () => {
  const local = storage();
  new TripRecoveryJournal(local, storage(), "owner", "closed").sync(
    pending("first"),
  );
  const reopened = new TripRecoveryJournal(local, storage(), "owner", "new");
  const [entry] = reopened.read();
  reopened.sync(
    new Map([[entry.draft.id, { ...entry, error: "", generation: 1 }]]),
  );
  reopened.sync(new Map());
  assert.equal(local.length, 0);
});

test("completing an adopted copy preserves newer changes in its originating tab", () => {
  const local = storage();
  const a = new TripRecoveryJournal(local, storage(), "owner", "a");
  a.sync(pending("first", "Original"));
  const b = new TripRecoveryJournal(local, storage(), "owner", "b");
  b.read();
  a.sync(pending("first", "Still typing"));
  b.sync(new Map());
  const reopened = new TripRecoveryJournal(local, storage(), "owner", "new");
  assert.equal(reopened.read()[0].draft.title, "Still typing");
});

test("reload prefers its own interrupted version and keeps a competing same-trip draft", () => {
  const local = storage(),
    sessionA = storage();
  new TripRecoveryJournal(local, sessionA, "owner", "a").sync(
    pending("first", "Tab A"),
  );
  new TripRecoveryJournal(local, storage(), "owner", "b").sync(
    pending("first", "Tab B"),
  );
  const reopened = new TripRecoveryJournal(local, sessionA, "owner", "a2");
  assert.equal(reopened.read()[0].draft.title, "Tab A");
  reopened.sync(new Map());
  const other = new TripRecoveryJournal(local, storage(), "owner", "c");
  assert.equal(other.read()[0].draft.title, "Tab B");
});

test("legacy multi-trip journals and exact retry snapshots survive migration", () => {
  const local = storage(),
    key = "trip-planner-pending-v1:owner";
  const first = pending("first").get("first")!;
  const second = pending("second").get("second")!;
  first.retryDraft = {
    draft: { ...first.draft, title: "Unconfirmed write" },
    generation: 0,
  };
  local.setItem(key, JSON.stringify([first, second]));
  const journal = new TripRecoveryJournal(local, storage(), "owner", "new");
  assert.equal(journal.read()[0].retryDraft?.draft.title, "Unconfirmed write");
  journal.sync(new Map([["second", second]]));
  assert.equal(local.getItem(key), null);
  assert.deepEqual(
    new TripRecoveryJournal(local, storage(), "owner", "inspect")
      .read()
      .map((entry) => entry.draft.id),
    ["second"],
  );
  journal.sync(new Map());
  assert.equal(local.length, 0);
});

test("journals cannot discover or delete another account's recovery", () => {
  const local = storage();
  new TripRecoveryJournal(local, storage(), "owner", "a").sync(
    pending("first"),
  );
  const other = new TripRecoveryJournal(local, storage(), "other-account", "b");
  assert.deepEqual(other.read(), []);
  other.sync(new Map());
  assert.equal(local.length, 1);
});

test("repeated offline reloads do not leave an older duplicate to replay after a successful save", () => {
  const local = storage(),
    session = storage();
  const first = new TripRecoveryJournal(local, session, "owner", "first-load");
  first.sync(pending("trip", "Interrupted event"));
  const second = new TripRecoveryJournal(
    local,
    session,
    "owner",
    "second-load",
  );
  second.read();
  second.sync(pending("trip", "Interrupted event"));
  const third = new TripRecoveryJournal(local, session, "owner", "third-load");
  assert.equal(third.read()[0].draft.title, "Interrupted event");
  third.sync(pending("trip", "Interrupted event"));
  third.sync(new Map());
  assert.equal(local.length, 0);
  assert.deepEqual(
    new TripRecoveryJournal(local, session, "owner", "later-load").read(),
    [],
  );
});

test("explicit discard removes known alternatives without deleting another tab's newer edit", () => {
  const local = storage();
  const a = new TripRecoveryJournal(local, storage(), "owner", "a");
  const b = new TripRecoveryJournal(local, storage(), "owner", "b");
  const c = new TripRecoveryJournal(local, storage(), "owner", "c");
  a.sync(pending("trip", "Version A"));
  b.sync(pending("trip", "Version B"));
  c.sync(pending("other-trip", "Unrelated trip"));
  const reopened = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "reopened",
  );
  reopened.read();
  reopened.sync(
    new Map([
      ...pending("trip", "Own pending copy"),
      ...pending("other-trip", "Unrelated trip"),
    ]),
  );
  b.sync(pending("trip", "Newer version B"));
  reopened.discard(["trip"]);
  const remaining = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "after-discard",
  ).read();
  assert.deepEqual(remaining.map((entry) => entry.draft.title).sort(), [
    "Newer version B",
    "Unrelated trip",
  ]);
});

test("editing a recovered draft transfers its ancestor only after the replacement is durable", () => {
  const local = storage(),
    session = storage();
  new TripRecoveryJournal(local, session, "owner", "first").sync(
    pending("trip", "Original offline edit"),
  );
  const resumed = new TripRecoveryJournal(local, session, "owner", "second");
  resumed.read();
  const originalSet = local.setItem;
  local.setItem = () => {
    throw new Error("Storage full");
  };
  assert.throws(
    () => resumed.sync(pending("trip", "Corrected offline edit")),
    /Storage full/,
  );
  assert.equal(local.length, 1);
  local.setItem = originalSet;
  resumed.sync(pending("trip", "Corrected offline edit"));
  assert.equal(local.length, 1);
  const final = new TripRecoveryJournal(local, session, "owner", "third");
  assert.equal(final.read()[0].draft.title, "Corrected offline edit");
  final.sync(new Map());
  assert.equal(local.length, 0);
});

test("a tab writing between another tab's comparison and removal keeps its newer snapshot", () => {
  const local = storage();
  const original = new TripRecoveryJournal(
    local,
    storage(),
    "owner",
    "original",
  );
  original.sync(pending("trip", "Initial draft"));
  const resumed = new TripRecoveryJournal(local, storage(), "owner", "resumed");
  resumed.read();
  const sourceKey = local.key(0)!;
  const getItem = local.getItem;
  let interleave = true;
  local.getItem = (key) => {
    const raw = getItem(key);
    if (key === sourceKey && interleave) {
      interleave = false;
      original.sync(pending("trip", "Typed during cleanup"));
    }
    return raw;
  };
  resumed.sync(new Map());
  local.getItem = getItem;
  const fresh = new TripRecoveryJournal(local, storage(), "owner", "fresh");
  assert.equal(fresh.read()[0].draft.title, "Typed during cleanup");
});
