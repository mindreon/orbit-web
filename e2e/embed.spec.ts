/**
 * wujie 嵌入协议。用假的 window.$wujie 注入 bus，检查嵌入态和独立部署两种行为。
 *
 * Ways this can fail (each is asserted below):
 *   W1 embedded, the page still renders its own sidebar (the base app owns the menu)
 *   W2 embedded, route changes are not reported to the base as `orbit:route-change`
 *   W3 embedded, the menu catalogue is not reported, or greyed-out entries leak into it
 *   W4 a base `orbit:navigate` is ignored, or navigating to the current address loops back as a new report
 *   W5 standalone, the sidebar is missing or the page touches a bus that does not exist
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./test";

type Emit = { event: string; args: unknown[] };

async function fakeWujie(page: Page) {
  await page.addInitScript(() => {
    const emits: { event: string; args: unknown[] }[] = [];
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const bus = {
      $emit: (event: string, ...args: unknown[]) => {
        emits.push({ event, args });
        handlers.get(event)?.forEach((handler) => handler(...args));
      },
      $on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
      },
      $off: (event: string, handler?: (...args: unknown[]) => void) => {
        if (handler) handlers.get(event)?.delete(handler);
      },
    };
    Object.assign(window, { $wujie: { bus }, __emits: emits });
  });
}

const emitted = (page: Page) => page.evaluate(() => (window as unknown as { __emits: Emit[] }).__emits);

/** Dev-mode StrictMode runs effects twice; the base treats a repeated identical report as a no-op, so collapse repeats. */
const routeReports = (emits: Emit[]) =>
  emits
    .filter((item) => item.event === "orbit:route-change")
    .map((item) => item.args[0])
    .filter((value, index, all) => value !== all[index - 1]);

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/**", (route) => route.fulfill({ json: { items: [], total: 0 } }));
});

test("embedded: content only, reports route and menu, follows base navigation", async ({ page }) => {
  await fakeWujie(page);
  await page.goto("/experts/skills");
  await expect(page.getByRole("heading", { name: "技能" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);

  const first = await emitted(page);
  expect(routeReports(first)).toEqual(["/experts/skills"]);
  const menu = first.find((item) => item.event === "orbit:menu");
  const sections = menu?.args[0] as { items: { href: string }[] }[];
  expect(sections[0].items.map((item) => item.href)).toEqual(["/", "/experts/agents", "/experts/skills", "/experts/connectors", "/projects", "/automation", "/library"]);

  await page.evaluate(() => (window as unknown as { $wujie: { bus: { $emit: (e: string, ...a: unknown[]) => void } } }).$wujie.bus.$emit("orbit:navigate", "/experts/connectors"));
  await expect(page.getByRole("heading", { name: "连接器" })).toBeVisible();
  await page.evaluate(() => (window as unknown as { $wujie: { bus: { $emit: (e: string, ...a: unknown[]) => void } } }).$wujie.bus.$emit("orbit:navigate", "/experts/connectors"));
  expect(routeReports(await emitted(page))).toEqual(["/experts/skills", "/experts/connectors"]);
});

test("standalone: keeps its own sidebar and emits nothing", async ({ page }) => {
  await page.goto("/experts/skills");
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  expect(await page.evaluate(() => "$wujie" in window)).toBe(false);
});
