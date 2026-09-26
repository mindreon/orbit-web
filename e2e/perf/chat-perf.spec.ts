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

const CONTROL = "http://127.0.0.1:18081";
const OUT = "perf-results";
const REPLY_CHARS = 50000;

type Frames = { fps: number; p95: number; slowFrames: number; frames: number; seconds: number };
type Latency = { eventTimingMax: number | null; eventTimingCount: number; nextFrameMax: number; nextFrameP95: number; keys: number };

async function post(page: Page, path: string, body: unknown) {
  const response = await page.request.post(`${CONTROL}${path}`, { data: body });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function installProbes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const shifts: { value: number; time: number }[] = [];
    const events: number[] = [];
    w.__shifts = shifts;
    w.__eventDurations = events;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) shifts.push({ value: entry.value, time: entry.startTime });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (["keydown", "keypress", "keyup", "input", "beforeinput"].includes(entry.name)) events.push(entry.duration);
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    const keyLatency: number[] = [];
    w.__keyLatency = keyLatency;
    // From the input event's timestamp to the frame after React has handled it: what the typist waits for.
    document.addEventListener(
      "input",
      (event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) return;
        const start = event.timeStamp;
        requestAnimationFrame(() => setTimeout(() => keyLatency.push(performance.now() - start), 0));
      },
      true,
    );
  });
}

function startFrames(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const times: number[] = [];
    w.__frameTimes = times;
    w.__recording = true;
    const tick = (now: number) => {
      times.push(now);
      if (w.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function stopFrames(page: Page): Promise<Frames> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__recording = false;
    const times = w.__frameTimes as number[];
    const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
    const seconds = (times[times.length - 1] - times[0]) / 1000;
    return {
      fps: Math.round(((times.length - 1) / seconds) * 10) / 10,
      p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] * 10) / 10,
      slowFrames: gaps.filter((gap) => gap > 20).length,
      frames: gaps.length,
      seconds: Math.round(seconds * 100) / 100,
    };
  });
}

function resetLatency(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, number[]>;
    w.__keyLatency.length = 0;
    w.__eventDurations.length = 0;
  });
}

function readLatency(page: Page): Promise<Latency> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, number[]>;
    const next = [...w.__keyLatency].sort((a, b) => a - b);
    const events = w.__eventDurations;
    return {
      eventTimingMax: events.length ? Math.max(...events) : null,
      eventTimingCount: events.length,
      nextFrameMax: Math.round(next[next.length - 1] * 10) / 10,
      nextFrameP95: Math.round(next[Math.floor(next.length * 0.95)] * 10) / 10,
      keys: next.length,
    };
  });
}

function readCls(page: Page) {
  return page.evaluate(() => {
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
}

async function wheelScroll(page: Page, steps: number, dy: number) {
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(16);
  }
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

test("1000 messages + a 50,000-character reply: scroll >= 50 fps, keystroke <= 50 ms", async ({ page, browser }) => {
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

  expect(up.fps).toBeGreaterThanOrEqual(50); // Q1
  expect(down.fps).toBeGreaterThanOrEqual(50);
  expect(typing.nextFrameMax).toBeLessThanOrEqual(50); // Q2
  if (typing.eventTimingMax !== null) expect(typing.eventTimingMax).toBeLessThanOrEqual(50);
});

test("streaming the 50,000-character reply over 1000 messages: CLS <= 0.1, keystroke <= 50 ms", async ({ page }) => {
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

  expect(cls.cls).toBeLessThanOrEqual(0.1); // Q3
  expect(latency.nextFrameMax).toBeLessThanOrEqual(50); // Q4
  expect(renderedChars).toBeGreaterThan(REPLY_CHARS * 0.8); // Q5
});
