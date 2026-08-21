import { describe, expect, it } from "vitest";
import { isSafeStorageKey } from "./app";

describe("storage asset proxy", () => {
  it("accepts generated static asset keys and rejects traversal attempts", () => {
    expect(isSafeStorageKey("attozap-logo_c75a0cb2.svg")).toBe(true);
    expect(isSafeStorageKey("../license-private.pem")).toBe(false);
    expect(isSafeStorageKey("folder/logo.svg")).toBe(false);
  });
});
