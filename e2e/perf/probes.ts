/** In-page probes shared by the perf specs: frame times, keystroke latency, layout shifts. */
import type { Page } from "@playwright/test";

export type Frames = { fps: number; p95: number; slowFrames: number; frames: number; seconds: number };
export type Latency = { eventTimingMax: number | null; eventTimingCount: number; nextFrameMax: number; nextFrameP95: number; keys: number };

export async function installProbes(page: Page) {
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

export function startFrames(page: Page) {
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

export function stopFrames(page: Page): Promise<Frames> {
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

export function resetLatency(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, number[]>;
    w.__keyLatency.length = 0;
    w.__eventDurations.length = 0;
  });
}

export function readLatency(page: Page): Promise<Latency> {
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

export function readCls(page: Page) {
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

export async function wheelScroll(page: Page, steps: number, dy: number) {
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(16);
  }
}

