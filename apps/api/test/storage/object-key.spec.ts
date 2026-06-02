/**
 * Unit test for the deterministic S3 object-key builder. Pure function — no
 * Postgres needed. Lives outside the integration suite so the test loop is
 * fast.
 */
import { describe, expect, it } from "vitest";
import { objectKey } from "../../src/storage/storage.module";

describe("objectKey", () => {
  const ORG = "00000000-0000-0000-0000-000000000abc";
  const TOKEN = "11111111-1111-1111-1111-111111111111";

  it("produces uploads/{org}/{intent}/{token}/{filename}", () => {
    expect(objectKey(ORG, "document", TOKEN, "policy.pdf")).toBe(
      `uploads/${ORG}/document/${TOKEN}/policy.pdf`,
    );
  });

  it("slugifies spaces and special chars", () => {
    expect(
      objectKey(ORG, "document", TOKEN, "Code of Conduct (2026).pdf"),
    ).toBe(`uploads/${ORG}/document/${TOKEN}/Code_of_Conduct_2026_.pdf`);
  });

  it("collapses runs of underscores and trims edge underscores", () => {
    expect(objectKey(ORG, "document", TOKEN, "  __weird name__  ")).toBe(
      `uploads/${ORG}/document/${TOKEN}/weird_name`,
    );
  });

  it("preserves common safe chars: word chars, dot, hyphen", () => {
    expect(objectKey(ORG, "document", TOKEN, "leave-policy-v2.1.pdf")).toBe(
      `uploads/${ORG}/document/${TOKEN}/leave-policy-v2.1.pdf`,
    );
  });

  it("falls back to 'file' when the filename slugifies to empty", () => {
    expect(objectKey(ORG, "document", TOKEN, "***")).toBe(
      `uploads/${ORG}/document/${TOKEN}/file`,
    );
  });

  it("caps the filename segment to 200 chars", () => {
    const long = "a".repeat(500) + ".pdf";
    const key = objectKey(ORG, "document", TOKEN, long);
    const lastSegment = key.split("/").pop() ?? "";
    expect(lastSegment.length).toBeLessThanOrEqual(200);
  });

  it("does not leak path traversal into the bucket layout", () => {
    // '../../etc/passwd' becomes a single slug — no `..` survives.
    const key = objectKey(ORG, "document", TOKEN, "../../etc/passwd");
    expect(key.includes("..")).toBe(false);
    expect(key.includes("/etc/")).toBe(false);
  });
});
