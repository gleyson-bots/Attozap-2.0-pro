import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  getSensitiveHint,
  hashSensitiveValue,
  secureCompare,
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
});
