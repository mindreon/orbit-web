import { defineConfig } from "vitest/config";

// Logic runs in node; component files opt into jsdom. WP9 adds journeys against the Compose stack.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/api/{client,errors,runEvents,sse}.ts", "src/app/auth/{controller,oidc}.ts", "src/app/queryClient.ts", "src/lib/{cn,contrast,fileTree,format}.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
