import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "test/**/*.integration.spec.ts",
    ],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
});
