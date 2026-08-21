import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("landing ATTOZAP", () => {
  it("mantém o logótipo oficial e os tokens verde-escuros da marca", async () => {
    const root = process.cwd();
    const [homeSource, stylesheet] = await Promise.all([
      readFile(path.join(root, "client/src/pages/Home.tsx"), "utf8"),
      readFile(path.join(root, "client/src/index.css"), "utf8"),
    ]);

    expect(homeSource).toContain("/manus-storage/attozap-logo_c75a0cb2.svg");
    expect(homeSource).toContain("ATTOZAP_LOGO_URL");
    expect(stylesheet).toContain("--atto-ink:#06100b");
    expect(stylesheet).toContain("--atto-emerald:#22c55e");
    expect(stylesheet).toContain("--atto-teal:#14b8a6");
  });
});
