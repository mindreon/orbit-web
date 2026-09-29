/** Shared helpers for the acceptance report: screenshots, measured values and verified steps. */
import { test, type Page } from "@playwright/test";

/** Screenshot attached to the test, so the acceptance report carries it as evidence. */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: options.fullPage });
  await test.info().attach(name, { path, contentType: "image/png" });
}

/**
 * Measured values (timings, fps, ids, byte sizes). They vary between runs, so the report keeps them in
 * measurements.json, outside the canonical report that two reruns must reproduce byte for byte.
 */
export async function metrics(values: Record<string, unknown>) {
  await test.info().attach("metrics", { body: JSON.stringify(values), contentType: "application/json" });
}

/**
 * One acceptance step: runs `run` (Playwright assertions), then records {items, step, expected, actual, pass}.
 * `run` returns the observed `actual` as text that does not depend on timing, ports or generated ids, so the same
 * commit always yields the same record. On failure the error's first line is recorded and the error rethrown.
 */
export async function verify(items: number[], step: string, expected: string, run: () => Promise<string>): Promise<string> {
  let actual: string;
  try {
    actual = await run();
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    await attachCheck({ items, step, expected, actual: message.replace(/\u001b\[[0-9;]*m/g, ""), pass: false });
    throw error;
  }
  await attachCheck({ items, step, expected, actual, pass: true });
  return actual;
}

async function attachCheck(check: { items: number[]; step: string; expected: string; actual: string; pass: boolean }) {
  await test.info().attach("check", { body: JSON.stringify(check), contentType: "application/json" });
}
