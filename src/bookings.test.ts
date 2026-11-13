import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingEventParams, tripForBooking } from "./booking-event.ts";

const trip = { start: "2026-12-20", end: "2026-12-27" };
const base = {
  bookingId: "b1",
  kind: "lodging" as const,
  title: "Seattle Waterfront Hotel",
  startDate: "2026-12-21",
  startTime: null as string | null,
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

test("a stated time fills the start and gives a one hour end, held inside the day", () => {
  const p = bookingEventParams({ ...base, startTime: "17:30" }, trip);
  assert.equal(p.start, "17:30");
  assert.equal(p.end, "18:30");
  assert.equal(bookingEventParams({ ...base, startTime: "23:30" }, trip).end, "23:59");
  assert.equal("start" in bookingEventParams(base, trip), false);
});

test("the trip picker preselects only when exactly one trip contains the date", () => {
  const trips = [
    { id: "a", start: "2026-12-20", end: "2026-12-27" },
    { id: "b", start: "2027-01-01", end: "2027-01-05" },
  ];
  assert.equal(tripForBooking({ startDate: "2026-12-22" }, trips), "a");
  assert.equal(tripForBooking({ startDate: "2026-11-01" }, trips), null);
  assert.equal(tripForBooking({ startDate: null }, trips), null);
  assert.equal(tripForBooking({ startDate: "2026-12-22" }, [...trips, { id: "c", start: "2026-12-21", end: "2026-12-23" }]), null);
});
