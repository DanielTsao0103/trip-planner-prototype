import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./data.ts";
import { sharedChangeError } from "./trip-permissions.ts";
import { validRecoveryTrip } from "./trip-recovery-validation.ts";
import { saveAccountTrip } from "./account-trips.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const idea = {
  id: "idea",
  name: "Museum",
  place: "Taipei",
  notes: "Book later",
  point: { lat: 25, lng: 121 },
  googlePlaceId: "place-id",
};
test("unscheduled ideas recover completely and require whole-trip editing", () => {
  const before = structuredClone(seed().trips[0]);
  delete before.sample;
  const owner = before.members.find((m) => m.role === "Owner")!;
  const editor = before.members.find((m) => m.id !== owner.id)!;
  editor.status = "accepted";
  const after = structuredClone(before);
  after.savedPlaces = [idea];
  assert.equal(validRecoveryTrip(after, owner.id), true);
  assert.equal(sharedChangeError(before, after, owner.id), "");
  for (const role of ["Editor", "Day Editor", "Viewer"] as const) {
    before.members.find((m) => m.id === editor.id)!.role = role;
    after.members.find((m) => m.id === editor.id)!.role = role;
    assert.equal(
      sharedChangeError(before, after, editor.id) === "",
      role === "Editor",
    );
  }
  assert.equal(
    validRecoveryTrip(
      { ...after, savedPlaces: [{ ...idea, point: { lat: "25", lng: 121 } }] },
      owner.id,
    ),
    false,
  );
  assert.equal(
    validRecoveryTrip(
      { ...after, savedPlaces: [{ ...idea, unexpected: true }] },
      owner.id,
    ),
    false,
  );
});

test("saved-place confirmation tolerates database key order but rejects lost ideas", async () => {
  const trip = structuredClone(seed().trips[0]);
  delete trip.sample;
  const account = trip.members.find((m) => m.role === "Owner")!;
  trip.savedPlaces = [idea];
  const content = structuredClone(trip);
  content.savedPlaces = [
    {
      notes: idea.notes,
      point: { lng: 121, lat: 25 },
      googlePlaceId: idea.googlePlaceId,
      place: idea.place,
      name: idea.name,
      id: idea.id,
    },
  ];
  const row = {
    tripID: trip.id,
    trip_name: trip.title,
    destinations: trip.destinations,
    start_date: trip.start,
    end_date: trip.end,
    timezone: trip.zone,
    revision: 1,
    content_version: 1,
    content,
  };
  const client = {
    rpc: async () => ({ data: row, error: null, status: 200 }),
  } as unknown as SupabaseClient;
  assert.deepEqual((await saveAccountTrip(client, account, trip)).savedPlaces, [
    idea,
  ]);
  content.savedPlaces = [];
  await assert.rejects(
    saveAccountTrip(client, account, trip),
    /could not be confirmed/,
  );
});
