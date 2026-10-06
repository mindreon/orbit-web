/** Screenshot helper for the stack E2E: attached to the test, so the Playwright report carries it as evidence. */
import { test, type Page } from "@playwright/test";

export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: options.fullPage });
  await test.info().attach(name, { path, contentType: "image/png" });
}

/** 开发者模式默认关着：要看计划图、执行记录、事件日志的测试先把它打开（等同设置页里的开关）。 */
export async function enableDeveloperMode(page: Page) {
  await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ developer: true })));
}

/** 打开右侧面板里的开发者视图（要先开开发者模式）；窄屏先展开抽屉。 */
export async function openDeveloperView(page: Page, phone: boolean) {
  if (phone && !(await page.getByRole("complementary", { name: "任务详情" }).isVisible())) await page.getByRole("button", { name: "展开详情" }).click();
  await page.getByRole("complementary", { name: "任务详情" }).getByRole("button", { name: "开发者视图" }).click();
}
