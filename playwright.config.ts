import { defineConfig, devices } from "@playwright/test";

const CONTROL_PORT = 18080;
const WEB_PORT = 3310;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["perf/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on",
    screenshot: "on",
    video: "on",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Safari's engine: the composer keys (IME Enter, keyCode 229) must hold there too.
    { name: "webkit", testMatch: /composer\.spec\.ts/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `node e2e/fake-control.mjs`,
      url: `http://127.0.0.1:${CONTROL_PORT}/health`,
      env: { FAKE_CONTROL_PORT: String(CONTROL_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { ORBIT_CONTROL_URL: `http://127.0.0.1:${CONTROL_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
