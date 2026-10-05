/** Screenshot helper for the stack E2E: attached to the test, so the Playwright report carries it as evidence. */
import { test, type Page } from "@playwright/test";

export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: options.fullPage });
  await test.info().attach(name, { path, contentType: "image/png" });
}
