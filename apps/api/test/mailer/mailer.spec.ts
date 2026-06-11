import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMailerFromEnv,
  MailerService,
  type MailerClient,
  type MailMessage,
} from "../../src/mailer/mailer.module";
import { resetEnvCacheForTests } from "../../src/infra/config/env";

const MSG: MailMessage = {
  to: "x@example.com",
  subject: "hi",
  html: "<p>hi</p>",
  text: "hi",
};

describe("buildMailerFromEnv — provider selection", () => {
  const original = { ...process.env };

  beforeEach(() => {
    // Minimum required vars so loadEnv() parses; the tests vary only EMAIL_*.
    process.env.DATABASE_URL =
      "postgresql://u:p@localhost:5432/db?schema=public";
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long-xx";
    // Prod-plausible values for the env production boot guards
    // (COOKIE_DOMAIN/APP_BASE_URL/EMAIL_FROM) so NODE_ENV=production cases
    // reach the mailer factory's own validation rather than failing in loadEnv.
    process.env.COOKIE_DOMAIN = "staffly.example.com";
    process.env.APP_BASE_URL = "https://app.staffly.example.com";
    process.env.EMAIL_FROM = "Staffly <no-reply@staffly.example.com>";
    resetEnvCacheForTests();
  });
  afterEach(() => {
    process.env = { ...original };
    resetEnvCacheForTests();
  });

  it("defaults to the log adapter when EMAIL_PROVIDER is unset", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(buildMailerFromEnv().provider).toBe("log");
  });

  it("production: refuses to boot when EMAIL_PROVIDER is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_PROVIDER;
    expect(() => buildMailerFromEnv()).toThrow(/EMAIL_PROVIDER unset/);
  });

  it("production: refuses to boot when provider creds are missing", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "smtp";
    delete process.env.SMTP_HOST;
    expect(() => buildMailerFromEnv()).toThrow(/SMTP_HOST unset/);
  });

  it("production: honors an explicit EMAIL_PROVIDER=log", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "log";
    expect(buildMailerFromEnv().provider).toBe("log");
  });

  it("falls back to log when provider=smtp but SMTP_HOST is unset", () => {
    process.env.EMAIL_PROVIDER = "smtp";
    delete process.env.SMTP_HOST;
    expect(buildMailerFromEnv().provider).toBe("log");
  });

  it("selects smtp when provider=smtp and SMTP_HOST is set", () => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.SMTP_HOST = "localhost";
    expect(buildMailerFromEnv().provider).toBe("smtp");
  });

  it("falls back to log when provider=resend but RESEND_API_KEY is unset", () => {
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    expect(buildMailerFromEnv().provider).toBe("log");
  });

  it("selects resend when provider=resend and RESEND_API_KEY is set", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    expect(buildMailerFromEnv().provider).toBe("resend");
  });
});

describe("MailerService — fire-and-forget resilience", () => {
  it("returns true when the adapter succeeds", async () => {
    const client: MailerClient = {
      provider: "log",
      send: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new MailerService(client);
    await expect(svc.send(MSG)).resolves.toBe(true);
    expect(client.send).toHaveBeenCalledOnce();
  });

  it("never throws and returns false when the adapter throws", async () => {
    const client: MailerClient = {
      provider: "smtp",
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };
    const svc = new MailerService(client);
    await expect(svc.send(MSG)).resolves.toBe(false);
  });
});
