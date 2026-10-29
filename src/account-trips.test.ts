import { test } from "node:test";
import assert from "node:assert/strict";
import { tripDetailsError, tripFromRow } from "./account-trips.ts";
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
