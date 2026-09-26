import { defineConfig, devices } from "@playwright/test";

const WEB = "http://127.0.0.1:3410";

/**
 * Acceptance E2E against the running stack in mock model mode (`pnpm test:stack`): Temporal, orbit-control,
 * orbit-orch, orbit-worker (ORBIT_MODEL_MODE=mock) and the orbit-web production build, started by e2e/stack/up.mjs.
 */
export default defineConfig({
  testDir: "./e2e/stack",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-stack" }],
    ["./e2e/report/acceptance-reporter.ts", { run: "stack", environment: "running stack, mock model mode: Temporal dev server + orbit-control + orbit-orch + orbit-worker (ORBIT_MODEL_MODE=mock) + orbit-web production build" }],
  ],
  outputDir: "test-results-stack",
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", testMatch: /composer\.spec\.ts/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "node e2e/stack/up.mjs",
    url: WEB,
    timeout: 900_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
});
