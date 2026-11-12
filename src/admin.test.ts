import assert from "node:assert/strict";
import { test } from "node:test";
import { adminEmailError, normalizeAdminEmail, sortAdminEntries } from "./admin.ts";

test("admin emails are compared in lowercase without surrounding spaces", () => {
  assert.equal(normalizeAdminEmail("  Seth@Example.COM "), "seth@example.com");
});

test("a new admin email must be valid and not already listed", () => {
  const listed = ["ivy@example.com", "dan@example.com"];
  assert.equal(adminEmailError("drew@example.com", listed), "");
  assert.equal(adminEmailError("  Drew@Example.com ", listed), "");
  assert.notEqual(adminEmailError("", listed), "");
  assert.notEqual(adminEmailError("not-an-email", listed), "");
  assert.notEqual(adminEmailError("a@b", listed), "");
  assert.notEqual(adminEmailError("two@example.com, three@example.com", listed), "");
  assert.match(adminEmailError("IVY@example.com", listed), /already has admin access/);
  assert.notEqual(adminEmailError(`${"x".repeat(281)}@example.com`, listed), "");
});

test("entries sort oldest first, then alphabetically for the seeded team", () => {
  const sorted = sortAdminEntries([
    { email: "z@example.com", addedAt: "2026-11-13T00:00:00Z" },
    { email: "b@example.com", addedAt: "2026-11-12T00:00:00Z" },
    { email: "a@example.com", addedAt: "2026-11-12T00:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((entry) => entry.email), ["a@example.com", "b@example.com", "z@example.com"]);
});
