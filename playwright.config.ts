import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.ORBIT_E2E_WEB_PORT ?? "3310");

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["stack/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["./e2e/report/acceptance-reporter.ts", { run: "scripted", environment: "orbit-web (vite) with a route-mocked task API, plus the dependency licence check" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on",
    screenshot: "on",
    video: "on",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: false,
  },
});
