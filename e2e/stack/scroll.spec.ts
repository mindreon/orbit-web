/**
 * Autoscroll and layout stability with replies streamed by the running stack.
 *
 * Ways this can fail (each is asserted below):
 *   A1 at the bottom, a new streamed reply is not followed.
 *   A2 scrolled up more than 80px, a new reply pulls the view back, or 「回到最新」 does not appear.
 *   A3 「回到最新」 jumps instead of scrolling smoothly, or does not reach the bottom.
 *   A4 streaming shifts layout: CLS (largest session window) above 0.1.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../test";
import { assistantItems, metrics, newRoom, openRoom, postMessage, shot, streamPrompt, verify } from "./helpers";

const scroller = (page: Page) => page.getByTestId("chat-scroll");
const distance = (page: Page) => scroller(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

function longReply(tag: string) {
  const parts = [`## ${tag}\n\n`];
  for (let index = 1; index <= 30; index += 1) parts.push(`${tag} 第 ${index} 段：The penalty clause should be capped at twenty percent.\n\n`);
  parts.push("| 条款 | 风险 |\n|---|---|\n| 7 | 高 |\n| 3 | 中 |\n\n", "```python\nprint('ok')\n```\n\n", `【${tag}结束】`);
  return streamPrompt(parts);
}

test("follows new replies at the bottom, pauses beyond 80px, 「回到最新」 scrolls smoothly; CLS stays <= 0.1", { tag: ["@acc-13"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 自动滚动");
  await postMessage(request, roomId, longReply("历史一"));
  await postMessage(request, roomId, longReply("历史二"));
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { value: number; time: number }[] };
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__shifts.push({ value: entry.value, time: entry.startTime });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await openRoom(page, roomId);
  await expect(assistantItems(page).filter({ hasText: "【历史二结束】" })).toHaveCount(1);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    (window as unknown as { __shifts: unknown[] }).__shifts.length = 0;
  });

  // A1 + A4: a reply streamed by another client while the reader sits at the bottom.
  let cls = { cls: 0, shifts: 0 };
  await verify([13], "停在底部时，另一个客户端让假模型流式输出一段长回复（含表格和代码）", "视图跟随到底部（距底 ≤ 2px）；流式期间 CLS ≤ 0.1", async () => {
    await postMessage(request, roomId, longReply("新回复一"));
    await expect(assistantItems(page).filter({ hasText: "【新回复一结束】" })).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(await distance(page)).toBeLessThanOrEqual(2);
    cls = await page.evaluate(() => {
      const shifts = (window as unknown as { __shifts: { value: number; time: number }[] }).__shifts;
      let worst = 0;
      let current = 0;
      let start = 0;
      let last = -Infinity;
      for (const shift of shifts) {
        if (shift.time - last > 1000 || shift.time - start > 5000) {
          current = 0;
          start = shift.time;
        }
        current += shift.value;
        last = shift.time;
        worst = Math.max(worst, current);
      }
      return { cls: Math.round(worst * 10000) / 10000, shifts: shifts.length };
    });
    expect(cls.cls).toBeLessThanOrEqual(0.1); // A4
    return "回复结束时停在底部（距底 ≤ 2px）；流式期间 CLS ≤ 0.1（实测见 measurements）";
  });

  // A2
  let parked = 0;
  await verify([13], "向上滚动超过 80px 后，再来一段流式回复", "视图不被拉回（scrollTop 不变），出现「回到最新」", async () => {
    await scroller(page).hover();
    await page.mouse.wheel(0, -600);
    await expect.poll(() => distance(page)).toBeGreaterThan(80);
    await page.waitForTimeout(400);
    parked = await scroller(page).evaluate((el) => el.scrollTop);
    await postMessage(request, roomId, longReply("新回复二"));
    await expect(page.getByTestId("jump-latest")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await scroller(page).evaluate((el) => el.scrollTop)).toBe(parked);
    return `距底 > 80px；新回复到达后 scrollTop 未变；「回到最新」可见（文案「${(await page.getByTestId("jump-latest").textContent())?.replace(/\d+/g, "N").trim()}」）`;
  });
  await shot(page, "paused-with-jump-button");

  // A3
  let intermediate = 0;
  await verify([13], "点「回到最新」", "平滑滚动（经过 ≥ 3 个中间位置）到底部，按钮消失", async () => {
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
    intermediate = new Set(positions.filter((top) => top > parked + 1 && top < end - 1)).size;
    expect(intermediate).toBeGreaterThanOrEqual(3);
    expect(await distance(page)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("jump-latest")).toHaveCount(0);
    return "经过 ≥ 3 个中间位置平滑到底（距底 ≤ 2px）；「回到最新」消失";
  });
  await metrics({ stackAutoscroll: { streamingCls: cls, smoothScrollIntermediatePositions: intermediate } });
  await shot(page, "after-jump-latest");
});
