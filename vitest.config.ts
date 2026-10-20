import { defineConfig } from "vitest/config";

// Logic runs in node; component files opt into jsdom. WP9 adds journeys against the Compose stack.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{js,ts}", "eslint-rules/**/*.test.js"],
  },
});
