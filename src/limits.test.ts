import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_LIMITS,
  MONEY_LIMITS,
  textError,
  invitationsError,
  moneyError,
} from "./limits.ts";
import { tripDetailsError } from "./account-trips.ts";

test("text boundaries reject oversized and whitespace-only required input without truncation", () => {
  for (const limit of Object.values(TEXT_LIMITS)) {
    assert.equal(textError("x".repeat(limit), "Text", limit, true), "");
    assert.notEqual(textError("x".repeat(limit + 1), "Text", limit), "");
  }
  assert.notEqual(textError("   ", "Name", 90, true), "");
  assert.equal(textError("", "Notes", 2200), "");
  assert.equal(textError("😀".repeat(50), "Title", 100), "");
  assert.notEqual(textError("😀".repeat(51), "Title", 100), "");
});

test("trip save accepts expanded boundaries and rejects over-limit destinations and title", () => {
  const trip = {
    title: "T".repeat(100),
    destinations: ["D".repeat(220)],
    start: "2027-01-01",
    end: "2027-01-02",
    zone: "UTC",
  };
  assert.equal(tripDetailsError(trip), "");
  for (const change of [
    { title: "T".repeat(101) },
    { destinations: ["D".repeat(221)] },
    { destinations: Array(21).fill("Paris") },
  ])
    assert.notEqual(tripDetailsError({ ...trip, ...change }), "");
});

test("invitation validation checks every address, the total length, and the count", () => {
  const list = Array.from(
    { length: 20 },
    (_, i) => `friend${i}@example.com`,
  ).join(", ");
  assert.equal(invitationsError(list), "");
  assert.notEqual(invitationsError(list + ",extra@example.com"), "");
  assert.notEqual(invitationsError("bad,address"), "");
  assert.notEqual(invitationsError("x".repeat(5601)), "");
  assert.notEqual(invitationsError("x".repeat(270) + "@example.com"), "");
});

test("money accepts cents at the ceiling and rejects exponents, fractions, infinity, and out-of-range amounts", () => {
  assert.equal(moneyError("999999.99", MONEY_LIMITS.budget), "");
  assert.equal(moneyError("99999.99", MONEY_LIMITS.expense), "");
  assert.equal(moneyError(".50", MONEY_LIMITS.expense), "");
  assert.equal(moneyError("0", MONEY_LIMITS.expense, true), "");
  for (const value of [
    "",
    " ",
    "0",
    "-1",
    "1.001",
    "1e3",
    "Infinity",
    "NaN",
    "100000",
    "99999999999999999999",
  ])
    assert.notEqual(moneyError(value, MONEY_LIMITS.expense), "", value);
});
