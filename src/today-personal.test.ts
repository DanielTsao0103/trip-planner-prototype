import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTodayChoices, parseTodayChoices, todayChoicesKey, noteParts } from "./today-personal.ts";

test("personal travel choices stay isolated by trip, identity and account/demo", () => {
  const keys = [todayChoicesKey("a", "trip", true), todayChoicesKey("b", "trip", true), todayChoicesKey("a", "other", true), todayChoicesKey("a", "trip", false)];
  assert.equal(new Set(keys).size, 4);
});
test("corrupt browser preferences recover without injecting an invalid route", () => {
  for (const raw of [null, "{", 'null', '12']) assert.deepEqual(parseTodayChoices(raw), defaultTodayChoices());
  const result = parseTodayChoices(JSON.stringify({ mode: "FLY", overrides: { one: "DRIVE", two: "FLY" }, returnPlace: { label: "Hotel", point: { lat: 91, lng: 0 } } }));
  assert.equal(result.mode, "WALK"); assert.deepEqual(result.overrides, { one: "DRIVE" }); assert.equal(result.returnPlace?.point, undefined);
});
test("return identity survives reload and invalid coordinates are discarded", () => {
  const place = { label: "Hotel", place: "123 Main", point: { lat: 1, lng: -2 }, googlePlaceId: "hotel-id" };
  assert.deepEqual(parseTodayChoices(JSON.stringify({ returnPlace: place })).returnPlace, place);
  assert.equal(parseTodayChoices(JSON.stringify({ returnPlace: { label: " " } })).returnPlace, undefined);
});
test("saved notes expose only valid http links and remain plain text otherwise", () => {
  const parts = noteParts('Ticket https://example.org/booking?a=1. javascript:alert(1) <script>alert(1)</script>');
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), ['https://example.org/booking?a=1']);
  assert.ok(parts.some(part => part.text.includes('<script>')));
  assert.equal(noteParts('https://').some(part => part.href), false);
});
