import { defineConfig } from "vitest/config";

// Unit tests cover the pure logic under src/lib. Browser flows stay in Playwright (e2e/).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Only the lib files that have unit tests are held to the bar; UI code is covered by the e2e suites.
      include: ["src/lib/taskEvents.ts", "src/lib/tasks.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
