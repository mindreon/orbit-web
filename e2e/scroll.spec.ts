/**
 * Autoscroll and layout stability while streaming (acceptance #13).
 *
 * Ways this can fail (each is asserted below):
 *   A1 at the bottom, streamed content is not followed.
 *   A2 scrolled up by 80px or less, the view stops following (threshold too tight).
 *   A3 scrolled up by more than 80px, new content pulls the view back down, or no 「回到最新」 button appears.
 *   A4 「回到最新」 jumps instead of scrolling smoothly, or does not end at the bottom.
 *   A5 streaming shifts layout: CLS (largest session window) above 0.1.
 *   A6 content already on screen flickers: a finished block is re-mounted while streaming or when the final message
 *      replaces the draft.
 */
import { expect, test, type Page } from "@playwright/test";
import { activity, control, delta, emit, openRoom } from "./helpers";

const scroller = (page: Page) => page.getByTestId("chat-scroll");
const distance = (page: Page) => scroller(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

function history(count: number) {
  return Array.from({ length: count }, (_, index) =>
    activity(`ev-${index + 1}`, index + 1, {
      type: "assistant.message",
      role: index % 2 === 0 ? "user" : "assistant",
      text: index % 2 === 0 ? `问题 ${index / 2 + 1}` : `回答 ${(index + 1) / 2}：\n\n- 第一点\n- 第二点\n\n补充一句说明。`,
      turnId: `tn-${Math.floor(index / 2)}`,
    }),
  );
}

async function streamLines(page: Page, turnId: string, from: number, count: number) {
  await emit(
    page.request,
    Array.from({ length: count }, (_, index) => ({ data: delta(turnId, "b-live", from + index, `第 ${from + index} 段流式内容。\n\n`) })),
  );
}

test.beforeEach(async ({ page }) => {
  await control(page.request, "/__test/clear");
});

test("follows at the bottom, pauses beyond 80px, and 「回到最新」 scrolls smoothly back", async ({ page }) => {
  await control(page.request, "/__test/activity", { items: history(60) });
  await openRoom(page, page.request);
  await expect(page.getByText("回答 30：")).toBeVisible();
  await page.getByTestId("chat-scroll").hover();

  // A1
  await streamLines(page, "tn-live", 1, 5);
  await expect(page.getByText("第 5 段流式内容。")).toBeVisible();
  expect(await distance(page)).toBeLessThanOrEqual(2);

  // A2: 60px up still counts as "at the latest".
  await page.mouse.wheel(0, -60);
  await expect.poll(() => distance(page)).toBeGreaterThan(30);
  await streamLines(page, "tn-live", 6, 3);
  await expect(page.getByText("第 8 段流式内容。")).toBeVisible();
  await expect.poll(() => distance(page)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("jump-latest")).toHaveCount(0);

  // A3: 400px up pauses following.
  await page.mouse.wheel(0, -400);
  await expect.poll(() => distance(page)).toBeGreaterThan(80);
  const parked = await scroller(page).evaluate((el) => el.scrollTop);
  await streamLines(page, "tn-live", 9, 6);
  await expect(page.getByTestId("jump-latest")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(parked);
  expect(await distance(page)).toBeGreaterThan(80);

  // A4: sample scrollTop every frame after the click.
  const trail = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const el = document.querySelector('[data-testid="chat-scroll"]')!;
        const positions: number[] = [];
        const started = performance.now();
        const tick = () => {
          positions.push(el.scrollTop);
          if (performance.now() - started < 1500) requestAnimationFrame(tick);
          else resolve(positions);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByTestId("jump-latest").click();
  const positions = await trail;
  const end = await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight);
  const intermediate = new Set(positions.filter((top) => top > parked + 1 && top < end - 1));
  expect(intermediate.size).toBeGreaterThanOrEqual(3);
  expect(await distance(page)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("jump-latest")).toHaveCount(0);
});

test("streaming keeps CLS at or below 0.1 and never re-mounts finished blocks", async ({ page }) => {
  await control(page.request, "/__test/activity", { items: history(20) });
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { value: number; time: number }[] };
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__shifts.push({ value: entry.value, time: entry.startTime });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await openRoom(page, page.request);
  await expect(page.getByText("回答 10：")).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __shifts: unknown[] }).__shifts = [];
  });

  const parts = [
    "## 结论\n\n",
    "第一段：付款条款需要调整，",
    "建议改为验收后付款。\n\n",
    "| 条款 | 风险 | 建议 |\n|---|---|---|\n",
    "| 第 3 条 | 中 | 验收后 30 日 |\n",
    "| 第 7 条 | 高 | 上限 20% |\n\n",
    "```python\ndef penalty(c, d):\n",
    "    return min(0.2 * c, 0.0005 * c * d)\n```\n\n",
    "```mermaid\nflowchart LR\n  A[收到] --> B[复核]\n```\n\n",
    "最后一段：请法务确认。",
  ];
  for (let index = 0; index < parts.length; index += 1) {
    await emit(page.request, { data: delta("tn-cls", "b-cls", index + 1, parts[index]) });
    await page.waitForTimeout(120);
    if (index === 2) {
      // A6: tag the first finished paragraph's DOM node.
      await page.getByTestId("assistant-draft").locator("p", { hasText: "第一段" }).evaluate((node) => {
        (node as HTMLElement & { __tag?: string }).__tag = "kept";
      });
    }
  }
  await emit(page.request, {
    data: activity("ev-final", 0, { type: "assistant.message", role: "assistant", turnId: "tn-cls", blockId: "b-cls", text: parts.join("") }),
  });
  const final = page.locator('[data-testid="chat-item"][data-kind="assistant"]').filter({ hasText: "最后一段" });
  await expect(final).toBeVisible();
  await expect(final.locator(".md-mermaid svg")).toBeVisible();
  await page.waitForTimeout(500);

  const tag = await final.locator("p", { hasText: "第一段" }).evaluate((node) => (node as HTMLElement & { __tag?: string }).__tag ?? null);
  expect(tag).toBe("kept"); // A6

  const cls = await page.evaluate(() => {
    const shifts = (window as unknown as { __shifts: { value: number; time: number }[] }).__shifts;
    let worst = 0;
    let windowValue = 0;
    let windowStart = 0;
    let last = -Infinity;
    for (const shift of shifts) {
      if (shift.time - last > 1000 || shift.time - windowStart > 5000) {
        windowValue = 0;
        windowStart = shift.time;
      }
      windowValue += shift.value;
      last = shift.time;
      worst = Math.max(worst, windowValue);
    }
    return { worst, total: shifts.reduce((sum, shift) => sum + shift.value, 0), count: shifts.length };
  });
  test.info().annotations.push({ type: "cls", description: JSON.stringify(cls) });
  expect(cls.worst).toBeLessThanOrEqual(0.1); // A5
});
