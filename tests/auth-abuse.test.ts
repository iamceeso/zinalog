import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLoginAttempts,
  clearMfaAttempts,
  consumeLoginAttempt,
  consumeMfaAttempt,
  resetAuthAbuseStore,
} from "../lib/auth-abuse";

test("limits repeated login attempts per ip and username and clears on success", () => {
  resetAuthAbuseStore();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(consumeLoginAttempt("203.0.113.10", "alice"), true);
  }

  assert.equal(consumeLoginAttempt("203.0.113.10", "alice"), false);

  clearLoginAttempts("203.0.113.10", "alice");
  assert.equal(consumeLoginAttempt("203.0.113.10", "alice"), true);
});

test("limits repeated mfa attempts per ip and challenge and clears on success", () => {
  resetAuthAbuseStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(consumeMfaAttempt("203.0.113.11", "challenge-hash"), true);
  }

  assert.equal(consumeMfaAttempt("203.0.113.11", "challenge-hash"), false);

  clearMfaAttempts("203.0.113.11", "challenge-hash");
  assert.equal(consumeMfaAttempt("203.0.113.11", "challenge-hash"), true);
});
