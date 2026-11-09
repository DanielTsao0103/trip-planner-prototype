import { test } from "node:test";
import assert from "node:assert/strict";
import { tripDetailsError, tripFromRow, saveAccountTrip } from "./account-trips.ts";
import { seed } from "./data.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
const details = {
  title: "Taipei",
  destinations: ["Taipei"],
  start: "2027-05-01",
  end: "2027-05-04",
  zone: "Asia/Taipei",
};
test("trip details reject invalid dates, long ranges, and empty destinations", () => {
  assert.equal(tripDetailsError(details), "");
  for (const change of [
    { start: "" },
    { start: "2027-02-30" },
    { end: "2027-04-30" },
    { end: "2028-05-01" },
    { destinations: [" "] },
    { title: " " },
    { zone: "Invalid/Zone" },
  ]) {
    assert.notEqual(tripDetailsError({ ...details, ...change }), "");
  }
  assert.equal(tripDetailsError({ ...details, end: details.start }), "");
});
test("missing timezone RPC uses the legacy writer only when one destination keeps its zone", async () => {
  const account = { id: "11111111-1111-4111-8111-111111111111", name: "Owner", email: "owner@example.com" };
  const trip = structuredClone(seed().trips[0]);
  trip.id = "33333333-3333-4333-8333-333333333333";
  trip.destinations = ["Michigan"];
  trip.destinationTimezones = ["America/Chicago"];
  trip.zone = "America/Chicago";
  trip.members = [{ ...trip.members[0], id: account.id, name: account.name, email: account.email }];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return calls.length === 1
      ? { data: null, error: { code: "PGRST202", message: "Function not found" }, status: 404 }
      : { data: null, error: { code: "P0001", message: "Legacy writer reached" }, status: 400 };
  } } as unknown as SupabaseClient;
  await assert.rejects(saveAccountTrip(client, account, trip), /Legacy writer reached/);
  assert.deepEqual(calls.map(call => call.name), ["save_trip_bundle_with_timezones", "save_trip_bundle"]);
  assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);

  trip.destinations = ["Michigan", "Chicago"];
  trip.destinationTimezones = ["America/Chicago", "America/Chicago"];
  calls.length = 0;
  await assert.rejects(saveAccountTrip(client, account, trip), /database needs an update/);
  assert.deepEqual(calls.map(call => call.name), ["save_trip_bundle_with_timezones"]);
});
test("database ownership becomes an account member without importing fictional identity", () => {
  const account = {
    id: "account-id",
    name: "Traveler",
    email: "maya@example.com",
  };
  const trip = tripFromRow(
    {
      tripID: "trip-id",
      owner_id: account.id,
      created_by: account.id,
      trip_name: "Saved trip",
      destination: "Taipei",
      destinations: ["Taipei", "Kaohsiung"],
      start_date: details.start,
      end_date: details.end,
      timezone: details.zone,
      revision: 3,
    },
    account,
  );
  assert.equal(trip.members[0].id, account.id);
  assert.equal(trip.members[0].role, "Owner");
  assert.equal(trip.persistence, "account");
  assert.equal(trip.revision, 3);
  assert.deepEqual(trip.destinations, ["Taipei", "Kaohsiung"]);
  assert.deepEqual(trip.events, []);
});

test("legacy guest IDs and orphaned financial references migrate without claiming accounts", () => {
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const account = { id: ownerId, name: "Owner", email: "owner@example.com" };
  const row = {
    tripID: "33333333-3333-4333-8333-333333333333",
    owner_id: ownerId,
    created_by: ownerId,
    trip_name: "Legacy trip",
    destination: "Taipei",
    destinations: ["Taipei"],
    start_date: details.start,
    end_date: details.end,
    timezone: details.zone,
    revision: 2,
  };
  const local = tripFromRow(row, account);
  local.members.push({
    id: "maya",
    name: "Maya",
    email: "maya@example.com",
    role: "Viewer",
    days: [],
    status: "accepted",
  });
  local.events.push({
    id: "old-event",
    name: "Museum",
    place: "Museum",
    date: details.start,
    start: "10:00",
    end: "11:00",
    cost: 0,
    notes: "Keep this",
    image: "/image.jpg",
    attendees: [ownerId, "maya"],
  });
  local.expenses.push({
    id: "old-expense",
    purpose: "Lunch",
    amount: 101,
    category: "Food",
    payer: ownerId,
    date: details.start,
    source: "Manual",
    shares: { [ownerId]: 51, removed: 50 },
    settled: ["removed"],
  });
  const imported = tripFromRow(row, account, local);
  const guest = imported.members.find((m) => m.name === "Maya")!;
  const archived = imported.members.find((m) => m.name === "Former traveler")!;
  assert.match(guest.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(guest.id, "maya");
  assert.deepEqual(imported.events[0].attendees, [ownerId, guest.id]);
  assert.equal(archived.status, "removed");
  assert.equal(imported.expenses[0].shares[archived.id], 50);
  assert.deepEqual(imported.expenses[0].settled, [archived.id]);
  assert.equal(local.members.length, 2);
  const database = tripFromRow(
    { ...row, content_version: 1, content: imported },
    account,
    { ...local, events: [] },
  );
  assert.equal(database.events[0].notes, "Keep this");
});
