import assert from "node:assert/strict";
import test from "node:test";
import { formatPercent, sharingProgress } from "./okr2.ts";

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
