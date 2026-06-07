/**
 * Recursively redacts sensitive values from audit before/after/metadata
 * snapshots before they leave the API. Snapshots are raw entity rows captured
 * at call sites, so secrets (password hashes, encrypted 2FA material, invite
 * token hashes, storage object keys) can appear and must never reach a client.
 *
 * A key is sensitive (case-insensitive) when it:
 *   - contains "password"        → passwordHash
 *   - contains "tokenhash"       → inviteTokenHash
 *   - ends with "enc"            → twoFactorSecretEnc, twoFactorRecoveryCodesEnc
 *   - contains "storagekey"      → document version storageKey
 *   - contains "secret"          → any *secret*
 *   - contains "recoverycodes"   → 2FA recovery codes
 */

export const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("password") ||
    k.includes("tokenhash") ||
    k.endsWith("enc") ||
    k.includes("storagekey") ||
    k.includes("secret") ||
    k.includes("recoverycodes")
  );
}

export function redact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redact(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redact(v);
    }
    return out as T;
  }
  return value;
}
