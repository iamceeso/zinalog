import assert from "node:assert/strict";
import test from "node:test";
import { ensureValidEmail } from "../lib/auth/session";

test("ensureValidEmail normalizes valid email addresses", () => {
  assert.equal(ensureValidEmail(" Admin@Example.COM "), "admin@example.com");
});

test("ensureValidEmail rejects malformed and expensive-looking inputs without regex backtracking", () => {
  const invalidEmails = [
    "",
    "missing-at.example.com",
    "missing-domain@",
    "@missing-local.example.com",
    "two@@example.com",
    "local@example",
    "local@.example.com",
    "local@example.com.",
    "local@example..com",
    "local name@example.com",
    `${"a".repeat(65)}@example.com`,
    `${"a".repeat(250)}@example.com`,
    `${"!.".repeat(4000)}@example.com`,
  ];

  for (const email of invalidEmails) {
    assert.throws(
      () => ensureValidEmail(email),
      /A valid email address is required/
    );
  }
});
