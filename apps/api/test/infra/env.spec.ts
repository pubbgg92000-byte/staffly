import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCacheForTests } from "../../src/infra/config/env";

describe("env schema — SMTP_SECURE strict boolean parse", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL =
      "postgresql://u:p@localhost:5432/db?schema=public";
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long-xx";
    resetEnvCacheForTests();
  });
  afterEach(() => {
    process.env = { ...original };
    resetEnvCacheForTests();
  });

  it("defaults to false when unset", () => {
    delete process.env.SMTP_SECURE;
    expect(loadEnv().SMTP_SECURE).toBe(false);
  });

  it('parses the literal string "false" as false (z.coerce.boolean would not)', () => {
    process.env.SMTP_SECURE = "false";
    expect(loadEnv().SMTP_SECURE).toBe(false);
  });

  it('parses "true" as true', () => {
    process.env.SMTP_SECURE = "true";
    expect(loadEnv().SMTP_SECURE).toBe(true);
  });

  it("rejects any other value with a clear boot error", () => {
    process.env.SMTP_SECURE = "1";
    expect(() => loadEnv()).toThrow(/Invalid environment: SMTP_SECURE/);
  });
});
