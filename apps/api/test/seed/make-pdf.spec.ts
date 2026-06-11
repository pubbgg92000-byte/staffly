import { describe, expect, it } from "vitest";
import { makePdf } from "../../prisma/seed-lib/storage";

describe("makePdf — seed document binary generator", () => {
  it("produces a valid PDF header and EOF marker", () => {
    const buf = makePdf("Information Security Policy");
    const s = buf.toString("latin1");
    expect(s.startsWith("%PDF-1.")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Type /Catalog");
    expect(s).toContain("(Information Security Policy)");
  });

  it("pads up to roughly the target size and stays valid", () => {
    const target = 200_000;
    const buf = makePdf("Big Doc", target);
    expect(buf.length).toBeGreaterThanOrEqual(target - 2000);
    expect(buf.length).toBeLessThanOrEqual(target + 2000);
    expect(buf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("escapes characters that would break PDF string syntax", () => {
    const buf = makePdf("Weird (title) \\ name");
    const s = buf.toString("latin1");
    // No raw unescaped parens/backslash inside the content stream title.
    expect(s).toContain("BT /F1 18 Tf");
    expect(s).not.toContain("(Weird (title)");
  });

  it("is deterministic for the same input", () => {
    expect(makePdf("X", 50_000).equals(makePdf("X", 50_000))).toBe(true);
  });
});
