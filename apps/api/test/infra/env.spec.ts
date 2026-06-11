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

describe("env schema — production boot guards (dev defaults must not reach prod)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL =
      "postgresql://u:p@localhost:5432/db?schema=public";
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long-xx";
    process.env.NODE_ENV = "production";
    // Prod-plausible values for all guarded vars; tests unset one at a time.
    process.env.COOKIE_DOMAIN = "staffly.example.com";
    process.env.APP_BASE_URL = "https://app.staffly.example.com";
    process.env.EMAIL_FROM = "Staffly <no-reply@staffly.example.com>";
    resetEnvCacheForTests();
  });
  afterEach(() => {
    process.env = { ...original };
    resetEnvCacheForTests();
  });

  it("boots with prod-plausible values", () => {
    expect(loadEnv().COOKIE_DOMAIN).toBe("staffly.example.com");
  });

  it("refuses to boot when COOKIE_DOMAIN defaults to localhost", () => {
    delete process.env.COOKIE_DOMAIN;
    expect(() => loadEnv()).toThrow(/COOKIE_DOMAIN.*localhost/);
  });

  it("refuses to boot when APP_BASE_URL points at localhost", () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(() => loadEnv()).toThrow(/APP_BASE_URL.*localhost/);
  });

  it("refuses to boot when APP_BASE_URL points at 127.0.0.1", () => {
    process.env.APP_BASE_URL = "http://127.0.0.1:3000";
    expect(() => loadEnv()).toThrow(/APP_BASE_URL.*localhost/);
  });

  it("refuses to boot when EMAIL_FROM is the dev .local default", () => {
    delete process.env.EMAIL_FROM;
    expect(() => loadEnv()).toThrow(/EMAIL_FROM.*staffly\.local/);
  });

  it("does not guard outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.COOKIE_DOMAIN;
    delete process.env.APP_BASE_URL;
    delete process.env.EMAIL_FROM;
    expect(loadEnv().COOKIE_DOMAIN).toBe("localhost");
  });

  it("reports all violations together (single boot error, complete picture)", () => {
    delete process.env.COOKIE_DOMAIN;
    process.env.APP_BASE_URL = "http://localhost:3000";
    delete process.env.EMAIL_FROM;
    expect(() => loadEnv()).toThrow(/COOKIE_DOMAIN.*APP_BASE_URL.*EMAIL_FROM/s);
  });
});
