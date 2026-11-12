import { test } from "node:test";
import assert from "node:assert/strict";
import { isPasswordRecoveryUrl, matchingRecovery, recoverySessionId } from "./password-recovery-state.ts";

test("URL routing recognizes recovery without authorizing password changes", () => {
  assert.equal(isPasswordRecoveryUrl(new URL("https://example.test/?password_recovery=1")), true);
  assert.equal(isPasswordRecoveryUrl(new URL("https://example.test/#type=recovery&access_token=untrusted")), true);
  assert.equal(isPasswordRecoveryUrl(new URL("https://example.test/?trip_invite=trip#type=invite")), false);
  assert.equal(matchingRecovery(null, "account", "session"), false);
});

test("verified recovery is bound to both account and Auth session and expires", () => {
  const proof = { userId: "account", sessionId: "session", expiresAt: Date.now() + 60000 };
  assert.equal(matchingRecovery(proof, "account", "session"), true);
  assert.equal(matchingRecovery(proof, "other-account", "session"), false);
  assert.equal(matchingRecovery(proof, "account", "other-session"), false);
  assert.equal(matchingRecovery(proof, "account", ""), false);
  assert.equal(matchingRecovery({ ...proof, expiresAt: Date.now() - 1 }, "account", "session"), false);
  assert.equal(matchingRecovery({ ...proof, expiresAt: Infinity }, "account", "session"), false);
});

test("session IDs are read defensively and missing IDs never match", () => {
  const jwt = `header.${Buffer.from(JSON.stringify({ session_id: "session" })).toString("base64url")}.signature`;
  assert.equal(recoverySessionId(jwt), "session");
  assert.equal(recoverySessionId("malformed"), "");
  assert.equal(recoverySessionId("header.e30.signature"), "");
});
