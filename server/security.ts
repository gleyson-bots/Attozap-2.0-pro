import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ENV } from "./_core/env";

const CIPHER_VERSION = "v1";

function getCipherKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required to protect AI provider credentials");
  }

  return createHash("sha256")
    .update(`${ENV.cookieSecret}:attozap:ai-agent-credentials`)
    .digest();
}

export function hashSensitiveValue(value: string) {
  return createHash("sha512").update(value.trim()).digest("hex");
}

export function getSensitiveHint(value: string) {
  const normalized = value.trim();
  return `••••${normalized.slice(-4)}`.slice(0, 24);
}

export function secureCompare(value: string, expectedHash: string) {
  const candidate = Buffer.from(hashSensitiveValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCipherKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value.trim(), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = payload.split(":");
  if (version !== CIPHER_VERSION || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted credential payload");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getCipherKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
