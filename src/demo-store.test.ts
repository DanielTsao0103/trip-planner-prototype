import test from "node:test";
import assert from "node:assert/strict";
import { demoStorageKey, loadDemoStore } from "./demo-store.ts";
import { seed } from "./data.ts";

const account = { id: "account-a", name: "Test Traveler", email: "test@example.com" };
const storage = (entries: Record<string, string>) => ({ getItem: (key: string) => entries[key] ?? null });

test("new real accounts retain the three sample trips without remote storage", () => {
  const state = loadDemoStore(account, storage({}));
  assert.equal(state.userId, account.id);
  assert.deepEqual(state.trips.map(t => t.id), ["seattle", "past", "winter"]);
});

test("legacy demo saves keep custom trips and the original user's membership", () => {
  const old = seed();
  old.trips.push({ ...structuredClone(old.trips[0]), id: "custom", title: "My saved test trip", sample: false });
  const raw = JSON.stringify(old);
  const state = loadDemoStore({ ...account, email: "maya@example.com" }, storage({ "trip-planner-v1": raw }));
  assert.equal(state.userId, "maya");
  assert.equal(state.trips.find(t => t.id === "custom")?.title, "My saved test trip");
  assert.equal(state.trips.find(t => t.id === "custom")?.members[0].id, "maya");
});

test("account saves survive reload with the active sample and return path intact", () => {
  const state = loadDemoStore(account, storage({}));
  state.userId = "maya";
  state.tripId = "seattle";
  state.sampleReturn = { userId: account.id, tripId: null };
  state.trips[0].title = "Edited demo trip";
  const saved = storage({ [demoStorageKey(account.id)]: JSON.stringify(state) });
  assert.deepEqual(loadDemoStore(account, saved), state);
  const other = loadDemoStore({ ...account, id: "account-b" }, saved);
  assert.equal(other.trips[0].title, "Seattle & Bainbridge getaway");
});
