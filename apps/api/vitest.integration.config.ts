import { defineConfig } from "vitest/config";

/**
 * Integration tests — require Docker (testcontainers spins up real Postgres).
 * Default `pnpm test` does NOT run these; use `pnpm test:integration`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.integration.spec.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ["default"],
  },
});
