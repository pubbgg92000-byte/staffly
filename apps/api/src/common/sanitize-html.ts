import sanitizeHtml from "sanitize-html";

/**
 * Allowlist HTML sanitizer for stored rich text (announcement bodyHtml).
 *
 * Stored bodyHtml is rendered with `dangerouslySetInnerHTML` in both portals,
 * so any markup that survives here runs in recipients' browsers. We sanitize on
 * WRITE (the single choke point) with a conservative allowlist: common
 * formatting + links, no scripts/events/styles, and links forced to safe
 * schemes + `rel="noopener noreferrer"`. This neutralises stored XSS
 * (`<script>`, `onerror=`, `javascript:` URLs) regardless of the render path.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
  "hr",
  "span",
];

export function sanitizeRichText(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: [],
    },
    // Only safe URL schemes; drops javascript:, data:, etc.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { a: ["http", "https", "mailto"] },
    disallowedTagsMode: "discard",
    transformTags: {
      // Force external-link safety on every anchor.
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
