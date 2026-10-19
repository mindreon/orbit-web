import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 2,
  timeout: 10 * 60_000,
  outputDir: "e2e-artifacts/results",
  reporter: [["list"], ["json", { outputFile: "e2e-artifacts/report.json" }]],
  use: {
    baseURL: process.env.ORBIT_E2E_BASE_URL,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "stack", grepInvert: /@mobile/, use: { viewport: { width: 1440, height: 900 } } },
    { name: "stack-mobile", grep: /@mobile/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
