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
test("missing atomic save RPC fails without falling back to partial writes", async () => {
  const account = { id: "owner", name: "Owner", email: "owner@example.com" };
  const trip = structuredClone(seed().trips[0]);
  trip.members = [{ ...trip.members[0], id: account.id, role: "Owner" }];
  const calls: string[] = [];
  const client = { rpc: async (name: string) => {
    calls.push(name);
    return { data: null, error: { code: "PGRST202", message: "Function not found" }, status: 404 };
  } } as unknown as SupabaseClient;
  await assert.rejects(saveAccountTrip(client, account, trip), /versions do not match/);
  assert.deepEqual(calls, ["save_account_trip"]);
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

test("legacy destination zones reach server reconciliation without rewriting shared settings", async () => {
  const account = { id: "owner", name: "Owner", email: "owner@example.com" };
  const trip = structuredClone(seed().trips[0]);
  trip.members = [{ ...trip.members[0], id: account.id, role: "Owner" }];
  trip.destinationTimezones = [];
  trip.destinations = ["Seattle", "Taipei"];
  trip.zone = "America/Los_Angeles";
  const calls: { name: string; args: Record<string, any> }[] = [];
  const client = { rpc: async (name: string, args: Record<string, any>) => {
    calls.push({ name, args });
    return { error: { code: "P0001", message: "Captured request" }, status: 400 };
  } } as unknown as SupabaseClient;
  await assert.rejects(saveAccountTrip(client, account, trip), /Captured request/);
  assert.equal(calls[0].name, "save_account_trip");
  assert.equal("p_destination_timezones" in calls[0].args, false);
  assert.deepEqual(calls[0].args.p_data.destinationTimezones, []);
  await assert.rejects(saveAccountTrip(client, { ...account, id: "editor" }, trip), /Captured request/);
  assert.equal(calls[1].name, "save_shared_trip_changes");
  assert.deepEqual(calls[1].args.p_data.destinationTimezones, []);
  assert.deepEqual(trip.destinationTimezones, []);
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

test("photo credit and trip changes use one transaction and only acknowledge server data", async () => {
  const account = { id: "owner", name: "Owner", email: "owner@example.com" };
  const trip = structuredClone(seed().trips[0]);
  delete trip.sample;
  trip.members = [{ ...trip.members[0], id: account.id, role: "Owner" }];
  trip.imageSource = "unsplash";
  trip.image = "https://images.unsplash.com/example.jpg";
  trip.imageCredit = { name: "Photographer", profileUrl: "https://unsplash.com/@example", photoUrl: trip.image };
  const credit = { source: "unsplash", photographer_name: trip.imageCredit.name,
    photographer_profile_url: trip.imageCredit.profileUrl, photo_url: trip.image };
  const row = { tripID: trip.id, trip_name: trip.title, destinations: trip.destinations,
    start_date: trip.start, end_date: trip.end, timezone: trip.zone,
    revision: 2, content_version: 1, content: trip, photoCredit: credit };
  const calls: string[] = [];
  // No from() method: any split photo-credit request must fail this test.
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    assert.deepEqual(args.p_photo_credit, credit);
    return { data: row, error: null, status: 200 };
  } } as unknown as SupabaseClient;
  const saved = await saveAccountTrip(client, account, trip);
  assert.deepEqual(saved.imageCredit, trip.imageCredit);
  assert.deepEqual(calls, ["save_account_trip"]);
  row.photoCredit = { ...credit, photographer_name: "Wrong credit" };
  await assert.rejects(saveAccountTrip(client, account, trip), error =>
    error instanceof Error && "retryOriginal" in error && error.retryOriginal === true);
});

test("an incomplete database acknowledgement never counts as a confirmed save", async () => {
  const account = { id: "owner", name: "Owner", email: "owner@example.com" };
  const trip = structuredClone(seed().trips[0]);
  trip.members = [{ ...trip.members[0], id: account.id, role: "Owner" }];
  for (const data of [null, { tripID: trip.id, revision: 2, content: { image: trip.image },
    trip_name: trip.title, destinations: trip.destinations, start_date: trip.start,
    end_date: trip.end, timezone: trip.zone }]) {
    const client = { rpc: async () => ({ data, error: null, status: 200 }) } as unknown as SupabaseClient;
    await assert.rejects(saveAccountTrip(client, account, trip), /did not confirm the complete save/);
  }
});
