import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingEventParams } from "./booking-event.ts";

const trip = { start: "2026-12-20", end: "2026-12-27" };
const base = {
  bookingId: "b1",
  kind: "lodging" as const,
  title: "Seattle Waterfront Hotel",
  startDate: "2026-12-21",
  location: "2411 Alaskan Way, Seattle, WA",
  confirmationCode: "84KD72QX",
};

test("a booking inside the trip opens on its own day with its details filled in", () => {
  const p = bookingEventParams(base, trip);
  assert.equal(p.suggestion, "Seattle Waterfront Hotel");
  assert.equal(p.date, "2026-12-21");
  assert.equal(p.place, "2411 Alaskan Way, Seattle, WA");
  assert.equal(p.booking, "b1");
  assert.match(p.notes, /Confirmation: 84KD72QX/);
});

test("a booking dated outside the trip opens on the first trip day instead", () => {
  assert.equal(bookingEventParams({ ...base, startDate: "2025-08-20" }, trip).date, "2026-12-20");
  assert.equal(bookingEventParams({ ...base, startDate: null }, trip).date, "2026-12-20");
});

test("missing location and code are left out, and long titles are clipped", () => {
  const p = bookingEventParams({ ...base, location: null, confirmationCode: null, title: "x".repeat(300) }, trip);
  assert.equal("place" in p, false);
  assert.equal(p.suggestion.length, 100);
  assert.doesNotMatch(p.notes, /Confirmation/);
});
