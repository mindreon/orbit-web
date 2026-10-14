import { defineConfig } from "vitest/config";

// Unit tests cover the logic that has no DOM: the API and SSE clients, the sign-in, the preview registry, the design checks.
// Pages and layout are exercised by the Playwright suites against the Compose stack (WP9).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/api/{client,errors,runEvents,sse}.ts", "src/app/auth/{controller,oidc}.ts", "src/app/queryClient.ts", "src/lib/{cn,contrast,fileTree,format}.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
