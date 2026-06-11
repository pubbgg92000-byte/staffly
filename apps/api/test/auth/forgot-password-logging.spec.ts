import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../src/auth/auth.service";
import { resetEnvCacheForTests } from "../../src/infra/config/env";

// RC-05: the password-reset URL embeds a live single-use token. It must never
// be written to the logs (or returned in the response) in production — only
// the email channel may carry it. Outside production the dev ergonomics (log +
// devResetUrl) are preserved.
describe("forgotPassword — reset URL logging gated to non-production (RC-05)", () => {
  const original = { ...process.env };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const RESET_MARKER = "/auth/reset-password?token=";

  const makeService = (): {
    svc: AuthService;
    mailer: { send: ReturnType<typeof vi.fn> };
  } => {
    const prisma = {
      db: {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "u1",
            email: "user@example.com",
            organizationId: "org1",
            status: "active",
          }),
        },
        passwordResetToken: { create: vi.fn().mockResolvedValue({}) },
      },
    };
    const passwords = { hash: vi.fn().mockResolvedValue("hash") };
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    // forgotPassword only touches prisma, passwords, and mailer; the other
    // constructor deps are unused on this path.
    const svc = new AuthService(
      prisma as never,
      passwords as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      mailer as never,
    );
    return { svc, mailer };
  };

  // Production-valid env (passes the boot guards in env.ts).
  const applyProdValidEnv = (): void => {
    process.env.DATABASE_URL =
      "postgresql://u:p@localhost:5432/db?schema=public";
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long-xx";
    process.env.COOKIE_DOMAIN = "staffly.example.com";
    process.env.APP_BASE_URL = "https://admin.staffly.example.com";
    process.env.EMAIL_FROM = "Staffly <no-reply@staffly.example.com>";
  };

  const loggedResetUrl = (): boolean =>
    warnSpy.mock.calls.some(([msg]) => String(msg).includes(RESET_MARKER));

  beforeEach(() => {
    warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...original };
    resetEnvCacheForTests();
  });

  it("does NOT log or return the reset URL in production, but still emails it", async () => {
    applyProdValidEnv();
    process.env.NODE_ENV = "production";
    resetEnvCacheForTests();
    const { svc, mailer } = makeService();

    const res = (await svc.forgotPassword({ email: "user@example.com" }, {
      ipAddress: "127.0.0.1",
    } as never)) as { ok: true; devResetUrl?: string };

    expect(loggedResetUrl()).toBe(false);
    expect(res.devResetUrl).toBeUndefined();
    // The real reset link must still reach the user via email.
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("DOES log and return the reset URL outside production (dev ergonomics preserved)", async () => {
    applyProdValidEnv(); // valid values; the guard only fires under production
    process.env.NODE_ENV = "development";
    resetEnvCacheForTests();
    const { svc, mailer } = makeService();

    const res = (await svc.forgotPassword({ email: "user@example.com" }, {
      ipAddress: "127.0.0.1",
    } as never)) as { ok: true; devResetUrl?: string };

    expect(loggedResetUrl()).toBe(true);
    expect(res.devResetUrl).toContain(RESET_MARKER);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});
