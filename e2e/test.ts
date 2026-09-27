/** Playwright `test` with an auto fixture that records the browser build for the acceptance report's versions. */
import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ recordEnvironment: void }>({
  recordEnvironment: [
    async ({ browser, browserName }, use, testInfo) => {
      await testInfo.attach("environment", { body: JSON.stringify({ [browserName]: browser.version() }), contentType: "application/json" });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
