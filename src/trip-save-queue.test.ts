import { test } from "node:test";
import assert from "node:assert/strict";
import { TripSaveQueue } from "./trip-save-queue.ts";
import { seed } from "./data.ts";
import type { Trip } from "./domain.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const draft = (): Trip => ({
  ...structuredClone(seed().trips[0]),
  persistence: "account",
  revision: 1,
});
test("rapid edits are serialized and advance the server revision without losing the latest draft", async () => {
  const writes: Trip[] = [];
  const resolvers: ((t: Trip) => void)[] = [];
  const outcomes: boolean[] = [];
  const queue = new TripSaveQueue(
    (t) => {
      writes.push(t);
      return new Promise((resolve) => resolvers.push(resolve));
    },
    () => {},
    (_, newer) => outcomes.push(newer),
  );
  const first = draft();
  queue.enqueue(first);
  queue.enqueue({ ...first, title: "Newest edit" });
  assert.equal(writes.length, 1);
  resolvers[0]({ ...first, revision: 2 });
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].revision, 2);
  assert.equal(writes[1].title, "Newest edit");
  const done = queue.wait(first.id);
  resolvers[1]({ ...writes[1], revision: 3 });
  await done;
  assert.equal(queue.pending.size, 0);
  assert.deepEqual(outcomes, [true, false]);
});
test("failed writes preserve drafts, stop automatic retries, and retry only on request", async () => {
  let attempts = 0;
  const queue = new TripSaveQueue(
    async (t) => {
      attempts++;
      if (attempts === 1) throw new Error("Offline");
      return { ...t, revision: 2 };
    },
    () => {},
    () => {},
  );
  const trip = draft();
  queue.enqueue(trip);
  await assert.rejects(queue.wait(trip.id), /Offline/);
  await tick();
  assert.equal(attempts, 1);
  assert.equal(queue.pending.get(trip.id)?.draft.title, trip.title);
  queue.retry();
  await queue.wait(trip.id);
  assert.equal(attempts, 2);
  assert.equal(queue.pending.size, 0);
});
test("restored recovery does not silently overwrite the database until retried", async () => {
  let attempts = 0;
  const queue = new TripSaveQueue(
    async (t) => {
      attempts++;
      return t;
    },
    () => {},
    () => {},
  );
  const trip = draft();
  queue.restore(trip);
  await tick();
  assert.equal(attempts, 0);
  await assert.rejects(queue.wait(trip.id), /Recovered/);
  queue.retry();
  await queue.wait(trip.id);
  assert.equal(attempts, 1);
});
test("one failed trip does not prevent another trip saving", async () => {
  const trip = draft();
  const saved: string[] = [];
  const queue = new TripSaveQueue(
    async (t) => {
      if (t.id === trip.id) throw new Error("Rejected");
      return t;
    },
    () => {},
    (t) => saved.push(t.id),
  );
  queue.enqueue(trip);
  queue.enqueue({ ...trip, id: "second" });
  await tick();
  await queue.wait("second");
  assert.deepEqual(saved, ["second"]);
  assert.equal(queue.pending.size, 1);
});
test("a lost response retries the original write before newer edits, avoiding duplicate or stale writes", async () => {
  const writes: Trip[] = [];
  let fail: (error: Error) => void = () => {};
  const queue = new TripSaveQueue(
    async (t) => {
      writes.push(t);
      if (writes.length === 1)
        return new Promise<Trip>((_, reject) => {
          fail = reject;
        });
      return { ...t, revision: (t.revision ?? 0) + 1 };
    },
    () => {},
    () => {},
  );
  const trip = draft();
  queue.enqueue(trip);
  queue.enqueue({ ...trip, title: "Typed while saving" });
  const failed = queue.wait(trip.id);
  fail(Object.assign(new Error("Response lost"), { retryOriginal: true }));
  await assert.rejects(failed);
  queue.retry();
  await queue.wait(trip.id);
  assert.equal(writes.length, 3);
  assert.equal(writes[1].title, trip.title);
  assert.equal(writes[2].title, "Typed while saving");
  assert.equal(writes[2].revision, 2);
});
