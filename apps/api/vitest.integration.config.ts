import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/**
 * Integration tests — require Docker (testcontainers spins up real Postgres).
 * Default `pnpm test` does NOT run these; use `pnpm test:integration`.
 *
 * The SWC plugin transpiles TS with `decorators` + `emitDecoratorMetadata`
 * enabled so NestJS's reflection-based DI works under vitest (esbuild does not
 * emit the design:paramtypes metadata Nest needs).
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.integration.spec.ts"],
    // Points Testcontainers at a Colima socket when the default is unusable
    // (no-op on Docker Desktop / CI). Lets `pnpm test:integration` run without
    // per-invocation DOCKER_HOST env vars.
    globalSetup: ["./test/setup-testcontainers.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    reporters: ["default"],
  },
});
