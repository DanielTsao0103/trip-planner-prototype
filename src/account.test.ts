import assert from "node:assert/strict";
import { test } from "node:test";
import { nameError, passwordChangeError, signInMethodOf } from "./account.ts";

test("email-only accounts are the only ones treated as email sign-ins", () => {
  assert.equal(signInMethodOf({ identities: [{ provider: "email" }], app_metadata: { provider: "email", providers: ["email"] } }), "email");
  assert.equal(signInMethodOf({ app_metadata: { provider: "email" } }), "email");
});

test("any Google connection makes it a Google account, so no password form is offered", () => {
  assert.equal(signInMethodOf({ identities: [{ provider: "google" }], app_metadata: { provider: "google" } }), "google");
  assert.equal(signInMethodOf({ app_metadata: { provider: "google", providers: ["google"] } }), "google");
  // Email and Google linked together still counts as Google.
  assert.equal(signInMethodOf({ identities: [{ provider: "email" }, { provider: "google" }], app_metadata: { provider: "email", providers: ["email", "google"] } }), "google");
});

test("other providers and unknown accounts never get the password form", () => {
  assert.equal(signInMethodOf({ identities: [{ provider: "apple" }], app_metadata: { provider: "apple" } }), "other");
  assert.equal(signInMethodOf({ identities: [{ provider: "email" }, { provider: "apple" }] }), "other");
  assert.equal(signInMethodOf(null), "other");
  assert.equal(signInMethodOf({}), "other");
});

test("names must be 1 to 90 characters after trimming", () => {
  assert.equal(nameError("Ivy Sanford"), "");
  assert.equal(nameError("x".repeat(90)), "");
  assert.equal(nameError(`  ${"x".repeat(90)}  `), "");
  assert.notEqual(nameError("   "), "");
  assert.notEqual(nameError(""), "");
  assert.notEqual(nameError("x".repeat(91)), "");
});

test("password changes need the current password, 8 to 72 new characters, a real change, and a match", () => {
  assert.equal(passwordChangeError("old-password", "new-password-1", "new-password-1"), "");
  assert.match(passwordChangeError("", "new-password-1", "new-password-1"), /current password/);
  assert.match(passwordChangeError("old-password", "short", "short"), /at least 8/);
  assert.match(passwordChangeError("old-password", "x".repeat(73), "x".repeat(73)), /72/);
  assert.equal(passwordChangeError("old-password", "x".repeat(72), "x".repeat(72)), "");
  assert.match(passwordChangeError("same-password", "same-password", "same-password"), /different/);
  assert.match(passwordChangeError("old-password", "new-password-1", "new-password-2"), /do not match/);
});
