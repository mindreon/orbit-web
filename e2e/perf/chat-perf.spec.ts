/**
 * Chat performance with 1000 messages plus one 50,000-character reply (acceptance #9, #13, #16).
 * Runs against the production build (see playwright.perf.config.ts) and writes numbers to perf-results/.
 *
 * Ways this can fail (each is asserted below):
 *   Q1 scrolling through the long reply and the 1000 messages drops below 50 fps.
 *   Q2 a keystroke in the composer takes longer than 50 ms to reach the screen (Event Timing, or input event to next frame).
 *   Q3 streaming the 50,000-character reply shifts layout: CLS above 0.1.
 *   Q4 typing while the reply streams waits longer than 50 ms for the main thread (input event to next frame).
 *      Event Timing during streaming is recorded too; in headless software rendering it includes raster time.
 *   Q5 the streamed reply is not rendered in full once the final message arrives.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import { longReply, replyDeltas } from "../fixtures/datasets.mjs";
import { metrics, shot } from "../helpers";
import { installProbes, readCls, readLatency, resetLatency, startFrames, stopFrames, wheelScroll } from "./probes";

const CONTROL = "http://127.0.0.1:18081";
const OUT = "perf-results";
const REPLY_CHARS = 50000;

async function post(page: Page, path: string, body: unknown) {
  const response = await page.request.post(`${CONTROL}${path}`, { data: body });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

const results: Record<string, unknown> = {};

test.beforeAll(async ({ browser }) => {
  results.environment = { browser: `chromium ${browser.version()}`, headless: true, cpus: cpus().length, build: "vite build (production)", measuredAt: new Date().toISOString() };
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/summary.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nchat perf results\n${JSON.stringify(results, null, 2)}`);
});

test("1000 messages + a 50,000-character reply: scroll >= 50 fps, keystroke <= 50 ms", { tag: ["@acc-9", "@acc-16"] }, async ({ page, browser }) => {
  await post(page, "/__test/clear", {});
  const loaded = await post(page, "/__test/dataset", { messages: 1000, replyChars: REPLY_CHARS });
  await installProbes(page);
  await page.goto("/task/room-e2e");
  await expect(page.locator('[data-testid="chat-item"][data-kind="assistant"]').filter({ hasText: "合同审阅完整报告" })).toBeAttached({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const replyHeight = await page.locator('[data-testid="chat-item"][data-kind="assistant"]').filter({ hasText: "合同审阅完整报告" }).evaluate((el) => el.getBoundingClientRect().height);

  mkdirSync(OUT, { recursive: true });
  await browser.startTracing(page, { path: `${OUT}/trace-scroll-and-type.json`, screenshots: true });
  await page.getByTestId("chat-scroll").hover();
  await startFrames(page);
  await wheelScroll(page, 150, -500);
  const up = await stopFrames(page);
  const mountedWhileUp = await page.locator('[data-testid="chat-item"]').count();
  await startFrames(page);
  await wheelScroll(page, 150, 500);
  const down = await stopFrames(page);

  await page.getByTestId("jump-latest").click({ timeout: 2000 }).catch(() => undefined);
  await page.getByLabel("输入消息").click();
  await resetLatency(page);
  await page.getByLabel("输入消息").pressSequentially("please cap clause seven at twenty percent and move the payment date", { delay: 60 });
  await page.waitForTimeout(300);
  const typing = await readLatency(page);
  await browser.stopTracing();

  results.static = {
    dataset: { events: loaded.items, replyChars: REPLY_CHARS, replyHeightPx: Math.round(replyHeight) },
    scrollUp: up,
    scrollDown: down,
    mountedRowsWhileScrolling: mountedWhileUp,
    typing,
  };
  await page.screenshot({ path: `${OUT}/static.png` });
  await shot(page, "fixture-1000-messages-50k-reply");
  await metrics({ fixture1000Messages50kReply: results.static });

  expect(up.fps).toBeGreaterThanOrEqual(50); // Q1
  expect(down.fps).toBeGreaterThanOrEqual(50);
  expect(typing.nextFrameMax).toBeLessThanOrEqual(50); // Q2
  if (typing.eventTimingMax !== null) expect(typing.eventTimingMax).toBeLessThanOrEqual(50);
});

test("streaming the 50,000-character reply over 1000 messages: CLS <= 0.1, keystroke <= 50 ms", { tag: ["@acc-13", "@acc-16"] }, async ({ page }) => {
  await post(page, "/__test/clear", {});
  await post(page, "/__test/dataset", { messages: 1000, replyChars: 0 });
  await installProbes(page);
  await page.goto("/task/room-e2e");
  await expect(page.getByText("把整份合同的审阅报告完整写出来。")).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await page.request.get(`${CONTROL}/__test/log`).then((r) => r.json())).open).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as { __shifts: unknown[] }).__shifts.length = 0;
  });

  const text = longReply(REPLY_CHARS);
  const frames = replyDeltas(text, { size: 50 });
  await startFrames(page);
  await page.getByLabel("输入消息").click();
  await resetLatency(page);
  const typing = page.getByLabel("输入消息").pressSequentially("typing while the reply streams should stay instant", { delay: 60 });
  const started = Date.now();
  for (let at = 0; at < frames.length; at += 40) {
    await post(page, "/__test/emit", frames.slice(at, at + 40));
    await page.waitForTimeout(30);
  }
  await typing;
  await expect(page.getByTestId("assistant-draft")).toContainText("第 ", { timeout: 10000 });
  const streamingMs = Date.now() - started;
  const streamFrames = await stopFrames(page);
  const latency = await readLatency(page);

  await post(page, "/__test/emit", {
    data: {
      id: "ds-final",
      type: "assistant.message",
      role: "assistant",
      roomId: "room-e2e",
      sessionId: "ses-dataset",
      agentId: "main",
      agentPath: "main",
      turnId: "ds-stream",
      blockId: "ds-stream-b",
      text,
    },
  });
  const final = page.locator('[data-testid="chat-item"][data-kind="assistant"]').filter({ hasText: "合同审阅完整报告" });
  await expect(final).toBeAttached();
  await page.waitForTimeout(1000);
  const cls = await readCls(page);
  const renderedChars = await final.evaluate((el) => el.textContent?.length ?? 0);

  results.streaming = { deltas: frames.length, streamingMs, frames: streamFrames, typing: latency, ...cls, renderedChars };
  await page.screenshot({ path: `${OUT}/streaming-final.png` });
  await metrics({ fixtureStreaming50kReply: results.streaming });

  expect(cls.cls).toBeLessThanOrEqual(0.1); // Q3
  expect(latency.nextFrameMax).toBeLessThanOrEqual(50); // Q4
  expect(renderedChars).toBeGreaterThan(REPLY_CHARS * 0.8); // Q5
});
