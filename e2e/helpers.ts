import { expect } from "@playwright/test";

export class ModelFailure extends Error {
  constructor(message: string, cause?: unknown) {
    // Playwright serializes error.message separately from error.name.
    super(`ModelFailure: ${message}: ${cause instanceof Error ? cause.message : ""}`, { cause });
    this.name = "ModelFailure";
  }
}
/** Wrap only model-content assertions. Platform assertions must use Playwright expect directly. */
export async function expectModel(assertion: () => unknown | Promise<unknown>, description = "模型输出未满足要求"): Promise<void> {
  try { await assertion(); } catch (error) { throw new ModelFailure(description, error); }
}
export async function login(page: import("@playwright/test").Page, email = "dev@orbit.local") {
  await page.goto("/orbit/login");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/orbit\/login$/);
}
export const journeyMarker = (journey: number) => `jw${journey}-${crypto.randomUUID()}`;
