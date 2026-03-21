import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from "crypto";

const ALGORITHM: CipherGCMTypes = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENCRYPTED_PREFIX = "enc:";

export const SENSITIVE_SETTING_KEYS = new Set([
  "smtp_pass",
  "resend_api_key",
  "telegram_bot_token",
]);

function getEncryptionKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) return null;
  if (hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;
  if (!plaintext) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    ENCRYPTED_PREFIX +
    iv.toString("hex") +
    ":" +
    authTag.toString("hex") +
    ":" +
    encrypted.toString("hex")
  );
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;

  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is required to decrypt settings but is not set",
    );
  }

  const payload = stored.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted setting value");

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  if (iv.length !== IV_BYTES) throw new Error("Invalid IV length in encrypted setting");
  if (authTag.length !== TAG_BYTES) throw new Error("Invalid auth tag in encrypted setting");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
