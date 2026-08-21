import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { ENV } from "./_core/env";

const CIPHER_VERSION = "v1";
const PASSWORD_KEY_LENGTH = 64;
const scrypt = promisify(scryptCallback);

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

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedValue: string) {
  const [algorithm, salt, expected] = storedValue.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const candidate = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
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
