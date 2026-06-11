import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { HealthController, withTimeout } from "../../src/health.controller";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import {
  buildClientFromEnv,
  StorageService,
} from "../../src/storage/storage.module";
import type { PrismaService } from "../../src/infra/prisma/prisma.service";
import { resetEnvCacheForTests } from "../../src/infra/config/env";

// StorageService.healthCheck() calls loadEnv() for the bucket name, so every
// test needs a parseable env (and a cold cache) regardless of which path it
// exercises.
const original = { ...process.env };
beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db?schema=public";
  process.env.JWT_SECRET = "test-secret-at-least-32-characters-long-xx";
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;
  resetEnvCacheForTests();
});
afterEach(() => {
  process.env = { ...original };
  resetEnvCacheForTests();
});

function prismaStub(ok: boolean): PrismaService {
  return {
    db: {
      $queryRaw: ok
        ? () => Promise.resolve([{ "?column?": 1 }])
        : () => Promise.reject(new Error("connection refused")),
    },
  } as unknown as PrismaService;
}

function captureFilterResponse(exception: unknown): {
  status: number;
  body: unknown;
} {
  const captured = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(exception, host);
  return captured;
}

describe("withTimeout", () => {
  it("passes through a promise that settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "x")).resolves.toBe(
      "ok",
    );
  });

  it("rejects a hung promise after the bound", async () => {
    const hung = new Promise(() => {});
    await expect(withTimeout(hung, 10, "database")).rejects.toThrow(
      /database probe timed out after 10ms/,
    );
  });
});

describe("/readyz degraded envelope shape (F-1.10 / OI-08)", () => {
  it("reports service.unavailable with the dependency breakdown in details", async () => {
    const storage = new StorageService({
      presignedPutObject: vi.fn(),
      presignedGetObject: vi.fn(),
      removeObject: vi.fn(),
      healthCheck: () => Promise.resolve(),
    });
    const controller = new HealthController(prismaStub(false), storage);

    const thrown = await controller.readyz().then(
      () => null,
      (e: unknown) => e,
    );
    expect(thrown).toBeInstanceOf(HttpException);

    const { status, body } = captureFilterResponse(thrown);
    expect(status).toBe(503);
    expect(body).toEqual({
      error: {
        code: "service.unavailable",
        message: "service not ready: dependency check failed",
        details: {
          status: "degraded",
          checks: { database: "fail", storage: "ok" },
        },
      },
    });
  });

  it("healthy path returns the bare report", async () => {
    const storage = new StorageService({
      presignedPutObject: vi.fn(),
      presignedGetObject: vi.fn(),
      removeObject: vi.fn(),
      healthCheck: () => Promise.resolve(),
    });
    const controller = new HealthController(prismaStub(true), storage);
    await expect(controller.readyz()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", storage: "ok" },
    });
  });
});

describe("storage readiness when unconfigured (F-1.4)", () => {
  it("the unconfigured client stub exposes no healthCheck", () => {
    expect(buildClientFromEnv().healthCheck).toBeUndefined();
  });

  it("readyz reports storage skipped (ready), not fail, on a storage-less boot", async () => {
    const storage = new StorageService(buildClientFromEnv());
    const controller = new HealthController(prismaStub(true), storage);
    await expect(controller.readyz()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok", storage: "skipped" },
    });
  });
});
