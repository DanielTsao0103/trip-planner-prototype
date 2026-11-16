import assert from "node:assert/strict";
import test from "node:test";
import { dayLabel, formatPercent, historyPoints, sharingProgress, trendChange } from "./okr2.ts";

test("no trips is 0% and not met", () => {
  const p = sharingProgress({ totalTrips: 0, sharedTrips: 0 });
  assert.equal(p.percent, 0);
  assert.equal(p.met, false);
  assert.equal(p.tripsToTarget, 0);
});

test("computes percent and trips still needed", () => {
  const p = sharingProgress({ totalTrips: 20, sharedTrips: 9 });
  assert.equal(p.percent, 45);
  assert.equal(p.tripsToTarget, 6);
  assert.equal(p.met, false);
});

test("exactly at and above target is met", () => {
  assert.equal(sharingProgress({ totalTrips: 20, sharedTrips: 15 }).met, true);
  assert.equal(sharingProgress({ totalTrips: 20, sharedTrips: 15 }).tripsToTarget, 0);
  assert.equal(sharingProgress({ totalTrips: 4, sharedTrips: 4 }).percent, 100);
});

test("rounds the needed count up and clamps bad input", () => {
  assert.equal(sharingProgress({ totalTrips: 10, sharedTrips: 7 }).tripsToTarget, 1);
  assert.equal(sharingProgress({ totalTrips: 5, sharedTrips: 9 }).sharedTrips, 5);
  assert.equal(sharingProgress({ totalTrips: -3, sharedTrips: 2 }).totalTrips, 0);
});

test("formats percent to one decimal", () => {
  assert.equal(formatPercent(33.333), "33.3%");
  assert.equal(formatPercent(75), "75%");
});

test("history is sorted, converted to percent, and summarized as a change", () => {
  const pts = historyPoints([
    { day: "2026-11-16", totalTrips: 10, sharedTrips: 6, estimate: false },
    { day: "2026-11-15", totalTrips: 10, sharedTrips: 4, estimate: true },
  ]);
  assert.deepEqual(pts.map((p) => p.percent), [40, 60]);
  assert.deepEqual(pts.map((p) => p.estimate), [true, false]);
  assert.equal(trendChange(pts), null, "one recorded point cannot establish measured change");
  assert.equal(trendChange(pts.slice(0, 1)), null);
  assert.equal(trendChange([]), null);
});

test("day labels do not shift with time zones", () => {
  assert.equal(dayLabel("2026-11-15"), "Nov 15");
  assert.equal(dayLabel("2026-01-01"), "Jan 1");
});


test("measured trend excludes estimated placeholders from both endpoints", () => {
  const points = historyPoints([
    { day: "2026-11-13", totalTrips: 10, sharedTrips: 1, estimate: true },
    { day: "2026-11-14", totalTrips: 10, sharedTrips: 4, estimate: false },
    { day: "2026-11-15", totalTrips: 10, sharedTrips: 6, estimate: false },
    { day: "2026-11-16", totalTrips: 10, sharedTrips: 9, estimate: true },
  ]);
  assert.equal(trendChange(points), 20);
  assert.equal(trendChange(points.filter(point => point.estimate)), null);
});
