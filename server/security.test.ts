import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  getSensitiveHint,
  hashPassword,
  hashSensitiveValue,
  secureCompare,
  verifyPassword,
} from "./security";

describe("server security helpers", () => {
  it("encrypts provider credentials without retaining the plain text", () => {
    const secret = "provider-key-for-test-only";
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("hashes and compares license material without returning the original key", () => {
    const hash = hashSensitiveValue("ATTOZAP-TEST-KEY-001");

    expect(hash).toHaveLength(128);
    expect(secureCompare("ATTOZAP-TEST-KEY-001", hash)).toBe(true);
    expect(secureCompare("ATTOZAP-TEST-KEY-002", hash)).toBe(false);
    expect(getSensitiveHint("ATTOZAP-TEST-KEY-001")).toBe("••••-001");
  });

  it("stores passwords with a salted scrypt hash and rejects a wrong password", async () => {
    const password = "uma-palavra-passe-segura";
    const stored = await hashPassword(password);

    expect(stored).toMatch(/^scrypt:/);
    expect(stored).not.toContain(password);
    await expect(verifyPassword(password, stored)).resolves.toBe(true);
    await expect(verifyPassword("palavra-passe-errada", stored)).resolves.toBe(false);
  });
});
