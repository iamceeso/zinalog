import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionKeyConfigured,
} from "../lib/secret-crypto";

const VALID_ENCRYPTION_KEY = "b".repeat(64);

test("isEncryptionKeyConfigured reflects whether ENCRYPTION_KEY is set", () => {
  const previousKey = process.env.ENCRYPTION_KEY;

  try {
    delete process.env.ENCRYPTION_KEY;
    assert.equal(isEncryptionKeyConfigured(), false);

    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    assert.equal(isEncryptionKeyConfigured(), true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  }
});

test("encryptSecret and decryptSecret round-trip when ENCRYPTION_KEY is set", () => {
  const previousKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;

  try {
    const encrypted = encryptSecret("super-secret");
    assert.match(encrypted, /^enc:/);
    assert.equal(decryptSecret(encrypted), "super-secret");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  }
});

test("encryptSecret returns plaintext when encryption is disabled or blank", () => {
  const previousKey = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;

  try {
    assert.equal(encryptSecret("plain-text"), "plain-text");
    assert.equal(encryptSecret(""), "");
    assert.equal(decryptSecret("already-plain"), "already-plain");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  }
});

test("secret crypto validates key and encrypted payload structure", () => {
  const previousKey = process.env.ENCRYPTION_KEY;

  try {
    process.env.ENCRYPTION_KEY = "short";
    assert.throws(
      () => encryptSecret("secret"),
      /ENCRYPTION_KEY must be a 64-character hex string/
    );

    process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
    assert.throws(
      () => decryptSecret("enc:missing-parts"),
      /Malformed encrypted setting value/
    );
    assert.throws(
      () =>
        decryptSecret(
          `enc:${"00".repeat(11)}:${"11".repeat(16)}:${"22".repeat(2)}`
        ),
      /Invalid IV length/
    );
    assert.throws(
      () =>
        decryptSecret(
          `enc:${"00".repeat(12)}:${"11".repeat(15)}:${"22".repeat(2)}`
        ),
      /Invalid auth tag/
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  }
});

test("decryptSecret requires ENCRYPTION_KEY for encrypted values", () => {
  const previousKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;
  const encrypted = encryptSecret("secret");
  delete process.env.ENCRYPTION_KEY;

  try {
    assert.throws(
      () => decryptSecret(encrypted),
      /ENCRYPTION_KEY is required to decrypt settings but is not set/
    );
  } finally {
    if (previousKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  }
});
