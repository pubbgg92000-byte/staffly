import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "../../src/common/sanitize-html";

describe("sanitizeRichText — announcement bodyHtml (stored XSS defense)", () => {
  it("strips <script> tags", () => {
    const out = sanitizeRichText("<p>hi</p><script>alert(1)</script>");
    expect(out).toContain("<p>hi</p>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event-handler attributes (onerror, onclick)", () => {
    const out = sanitizeRichText(
      '<img src=x onerror="alert(2)"><p onclick="x()">t</p>',
    );
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("onclick");
    // img is not in the allowlist → dropped entirely
    expect(out.toLowerCase()).not.toContain("<img");
  });

  it("drops javascript: URLs on links", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("keeps safe formatting and links, forcing rel/target on anchors", () => {
    const out = sanitizeRichText(
      '<p>Hello <strong>team</strong></p><a href="https://x.com">link</a><ul><li>a</li></ul>',
    );
    expect(out).toContain("<strong>team</strong>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain('href="https://x.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("is idempotent (sanitizing already-clean output is a no-op)", () => {
    const once = sanitizeRichText("<p>safe <em>text</em></p>");
    expect(sanitizeRichText(once)).toBe(once);
  });

  it("neutralizes a data: URI image payload", () => {
    const out = sanitizeRichText(
      '<img src="data:text/html,<script>alert(1)</script>">',
    );
    expect(out.toLowerCase()).not.toContain("<img");
    expect(out.toLowerCase()).not.toContain("<script");
  });
});
