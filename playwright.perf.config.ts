import { defineConfig, devices } from "@playwright/test";

const PORT = 18081;

/** Chat performance checks against the production build (`pnpm perf:chat`). Results land in perf-results/. */
export default defineConfig({
  testDir: "./e2e/perf",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  outputDir: "perf-results/artifacts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "pnpm exec vite build && node e2e/fake-control.mjs",
    url: `http://127.0.0.1:${PORT}/health`,
    env: { FAKE_CONTROL_PORT: String(PORT), STATIC_DIR: "dist" },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
