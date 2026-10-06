/**
 * Following the conversation, the return-to-bottom button and the turn rail (route-mocked API, a fake EventSource the test pushes events into).
 * Screenshots go to e2e-artifacts/scroll/<theme>-<width>x<height>-<scene>.png (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   S1 opening a long task does not land at the bottom, or streaming text / growing content does not keep it pinned there
 *   S2 scrolling up does not stop the follow, or the button does not appear, or more streaming drags the reader back down
 *   S3 the button does not return to the bottom and re-pin, or is still shown when at the bottom
 *   S4 the button shows an arrow while the task is producing output (should be three dots) or dots when idle, or is not 36px / not named 回到底部
 *   S5 the rail shows below 4 settled turns (a turn still being written does not count), or is missing at 4+
 *   S6 a bar does not jump to its turn (smooth when near, instant when far), or the bars in view are not stronger than the rest
 *   S7 the tooltip lacks the user's line or the reply's 3-line clamp, or a bar is not a button named 第 N 轮：…
 *   S8 the rail shows on a phone width / coarse pointer
 *   S9 the page scrolls sideways at either width, or any of this breaks in the dark theme
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/scroll";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";

const task = (status: string) => ({
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理周报",
  goal: "整理周报",
  mode: "single",
  status,
  profile: "writer@1",
  plan_version: 1,
  created_by: "user-a",
  created_at: "2026-10-03T08:00:00Z",
  updated_at: "2026-10-05T08:01:41Z",
  budgets: {},
  usage: {},
  pending_approvals: [],
});
const plan = { plan_version: 1, hash: `sha256:${"a".repeat(64)}`, nodes: [{ node_id: "n_1", type: "agent_turn", title: "整理周报", status: "COMPLETED", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: true, attempt_count: 1 }], edges: [] };
const expert = { expert_id: "writer", ref: "writer@1", version: 1, name: "文案专家", instructions: "你是一名文案专家。", model: "test-model", connector_ids: [], skill_ids: [], created_at: "2026-10-03T08:00:00Z" };

type Ev = { seq: number; after_seq?: number; event_id: string; task_id: string; type: string; source: string; payload: Record<string, unknown>; occurred_at: string };

const at = (n: number) => `2026-10-05T08:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}Z`;
const REPLY = "这一周主要完成了三件事：第一，把需求文档整理成了清单；第二，补齐了接口的联调用例并全部跑通；第三，梳理了上线前的风险项，并和相关同学逐条确认了处理办法。下周继续跟进灰度发布，关注错误率和耗时的变化。";

/** `settled` finished turns (a message of yours and the reply), then, when `running`, one more whose reply is still being written. */
function conversation(settled: number, running: boolean) {
  const events: Ev[] = [];
  let seq = 0;
  const durable = (type: string, payload: Record<string, unknown>) => {
    seq += 1;
    events.push({ seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "worker", payload, occurred_at: at(seq) });
  };
  durable("task.created", { goal: "整理周报", title: "整理周报" });
  const turn = (n: number, finished: boolean) => {
    durable("message.user", { text: `第 ${n} 个问题：这周的进展怎么样？`, delivery: "queue" });
    durable("attempt.started", { attempt_id: `att_${n}`, node_id: "n_1", attempt_no: n, profile: "writer@1" });
    if (!finished) return;
    durable("message.agent_final", { attempt_id: `att_${n}`, text: `第 ${n} 轮的回复。${REPLY}${REPLY}` });
    durable("attempt.finished", { attempt_id: `att_${n}`, node_id: "n_1", outcome: "completed" });
  };
  for (let n = 1; n <= settled; n += 1) turn(n, true);
  if (running) {
    turn(settled + 1, false);
    events.push({ seq: 0, after_seq: seq, event_id: "eph_0", task_id: TASK_ID, type: "agent.token_delta", source: "worker", payload: { attempt_id: `att_${settled + 1}`, block_id: "b0", text: "正在整理，" }, occurred_at: at(seq + 1) });
  }
  return { events, lastSeq: seq, attempt: `att_${settled + 1}` };
}

async function mockBackend(page: Page, events: Ev[], status: string) {
  await page.addInitScript((items) => {
    class FakeEventSource {
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        Object.assign(window, { __source: this });
        setTimeout(() => {
          this.onopen?.({});
          for (const item of items) this.onmessage?.({ data: JSON.stringify(item) });
        }, 20);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, events);
  await page.route("**/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (pathname === "/v1/tasks") return json({ items: [task(status)] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json(task(status));
    if (pathname.endsWith("/plan")) return json(plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [] });
    if (pathname.endsWith("/config")) return json({ config_version: 1, expert: "writer@1", skills: null, connector_ids: null, mode: "default" });
    if (pathname === "/v1/experts") return json({ items: [expert] });
    if (pathname === "/v1/models") return json({ items: ["test-model"], default: "test-model" });
    return json({ items: [], total: 0 });
  });
}

/** More streamed words for the running reply, as the server sends them (ephemeral events follow the last durable one). */
let ephemeral = 0;
const stream = (page: Page, attempt: string, lastSeq: number, text: string) => {
  ephemeral += 1;
  const event: Ev = { seq: 0, after_seq: lastSeq, event_id: `eph_${ephemeral}`, task_id: TASK_ID, type: "agent.token_delta", source: "worker", payload: { attempt_id: attempt, block_id: "b0", text }, occurred_at: at(500 + ephemeral) };
  return page.evaluate((item) => (window as unknown as { __source: { onmessage: (e: { data: string }) => void } }).__source.onmessage({ data: JSON.stringify(item) }), event);
};
const PARAGRAPH = "又整理了一段内容，包含进展、风险和下一步安排。\n\n";

const scrollerState = (page: Page) =>
  page.getByTestId("conversation-scroller").evaluate((el) => ({ top: el.scrollTop, distance: el.scrollHeight - el.scrollTop - el.clientHeight, tall: el.scrollHeight > el.clientHeight * 1.5 }));

async function wheelUp(page: Page, pixels: number) {
  const box = (await page.getByTestId("conversation-scroller").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -pixels);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`scroll @ ${viewport.name}`, () => {
    const phone = viewport.width < 640;
    test.use({ viewport: { width: viewport.width, height: viewport.height }, timezoneId: "Asia/Shanghai", ...(phone ? { hasTouch: true, isMobile: true } : {}) });

    async function shot(page: Page, theme: string, scene: string) {
      mkdirSync(OUT, { recursive: true });
      await page.waitForTimeout(200);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, `${scene}: page scrolls sideways`).toBeLessThanOrEqual(inner);
      await page.screenshot({ path: join(OUT, `${theme}-${viewport.name}-${scene}.png`) });
    }

    for (const theme of ["light", "dark"] as const) {
      test.describe(theme, () => {
        test.beforeEach(async ({ page }) => {
          if (theme === "dark") await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ theme: "深色" })));
        });
        const open = async (page: Page, settled: number, running: boolean) => {
          const scene = conversation(settled, running);
          await mockBackend(page, scene.events, running ? "RUNNING" : "COMPLETED");
          await page.goto(`/tasks/${TASK_ID}`);
          if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
          await expect(page.getByTestId("user-message")).toHaveCount((running ? settled + 1 : settled) + 1); // + the goal, which task.created shows as the first message
          return scene;
        };

        test("follow: lands at the bottom, stays pinned while streaming, stops when you scroll up, resumes on the button", async ({ page }) => {
          const scene = await open(page, 8, true);

          // S1: opened at the bottom, no button
          await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
          expect((await scrollerState(page)).tall, "the conversation is long enough to scroll").toBe(true);
          await expect(page.getByRole("button", { name: "回到底部" })).toHaveCount(0);

          // S1: streaming keeps it pinned, delta after delta, without ever showing the button
          for (let i = 0; i < 6; i += 1) {
            await stream(page, scene.attempt, scene.lastSeq, PARAGRAPH.repeat(3));
            await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
          }
          await expect(page.getByRole("button", { name: "回到底部" })).toHaveCount(0);

          // S2: a wheel up stops the follow and shows the button
          await wheelUp(page, 700);
          const button = page.getByRole("button", { name: "回到底部" });
          await expect(button).toBeVisible();
          await page.waitForTimeout(300);
          const parked = (await scrollerState(page)).top;

          // S2: more words arrive and the reader stays where they are
          for (let i = 0; i < 4; i += 1) await stream(page, scene.attempt, scene.lastSeq, PARAGRAPH.repeat(3));
          await page.waitForTimeout(400);
          const after = await scrollerState(page);
          expect(Math.abs(after.top - parked), "the reader was dragged").toBeLessThanOrEqual(1);
          expect(after.distance).toBeGreaterThan(100);
          await expect(button).toBeVisible();

          // S4: the task is producing output: three dots, no arrow; 36px round, card surface, named 回到底部
          await expect(button.getByTestId("scroll-dots").locator("span")).toHaveCount(3);
          await expect(button.locator("svg")).toHaveCount(0);
          const look = await button.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const dot = el.querySelector(".typing-dot") as HTMLElement;
            const scroller = document.querySelector('[data-testid="conversation-scroller"]')!.getBoundingClientRect();
            const column = document.querySelector('[data-testid="conversation-column"]')!.getBoundingClientRect();
            return { w: box.width, h: box.height, radius: style.borderTopLeftRadius, border: style.borderTopWidth, shadow: style.boxShadow, dot: dot.getBoundingClientRect().width, anim: getComputedStyle(dot).animationDuration, gap: scroller.bottom - box.bottom, centre: box.left + box.width / 2 - (column.left + column.width / 2) };
          });
          expect(look.w).toBe(36);
          expect(look.h).toBe(36);
          expect(Number.parseFloat(look.radius)).toBeGreaterThanOrEqual(18);
          expect(look.border).toBe("1px");
          expect(look.shadow).not.toBe("none");
          expect(look.dot).toBe(4);
          expect(look.anim).toBe("1.2s");
          expect(Math.round(look.gap), "12px above the bottom of the scroll area").toBe(12);
          expect(Math.abs(look.centre), "centred on the reading column").toBeLessThanOrEqual(1);
          await shot(page, theme, "button-streaming");

          // S3: the button goes down and re-pins
          await button.click();
          await expect.poll(async () => (await scrollerState(page)).distance, { timeout: 5000 }).toBeLessThanOrEqual(2);
          await expect(button).toHaveCount(0);
          await stream(page, scene.attempt, scene.lastSeq, PARAGRAPH.repeat(4));
          await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
        });

        test("button: an arrow when idle, back to the bottom on click", async ({ page }) => {
          await open(page, 8, false);
          await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
          await wheelUp(page, 900);
          const button = page.getByRole("button", { name: "回到底部" });
          await expect(button).toBeVisible();
          // S4: nothing is being written, so an arrow
          await expect(button.locator("svg")).toHaveCount(1);
          await expect(button.getByTestId("scroll-dots")).toHaveCount(0);
          await shot(page, theme, "button-idle");
          await button.click();
          await expect.poll(async () => (await scrollerState(page)).distance, { timeout: 5000 }).toBeLessThanOrEqual(2);
          await expect(button).toHaveCount(0);
        });

        test("rail: absent below four settled turns, present from four", async ({ page }) => {
          // S5: three settled turns and a fourth still being written do not make a rail
          await open(page, 3, true);
          await expect(page.getByTestId("turn-rail")).toHaveCount(0);
          await stream(page, "att_4", conversation(3, true).lastSeq, "再多几个字。");
          await expect(page.getByTestId("turn-rail")).toHaveCount(0);
        });

        test("rail: four settled turns, bars, jump, tooltip", async ({ page }) => {
          await open(page, 9, false);
          await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
          const rail = page.getByTestId("turn-rail");
          if (phone) {
            // S8: a phone has neither the room nor a pointer
            await expect(rail).toHaveCount(0);
            await shot(page, theme, "rail-hidden");
            return;
          }
          await expect(rail).toBeVisible();
          const bars = rail.getByRole("button");
          await expect(bars).toHaveCount(9);
          await expect(bars.nth(0)).toHaveAttribute("aria-label", "第 1 轮：第 1 个问题：这周的进展怎么样？");

          // geometry: a 30x10 hit row with a 26x2 bar, at the left edge of the scroll area, centred vertically, at most 70% / 640px high
          const geometry = await page.evaluate(() => {
            const nav = document.querySelector('[data-testid="turn-rail"]')!.getBoundingClientRect();
            const scroller = document.querySelector('[data-testid="conversation-scroller"]')!.getBoundingClientRect();
            const row = document.querySelector('[data-testid="turn-rail-bar"]')!;
            const bar = row.firstElementChild as HTMLElement;
            const rowBox = row.getBoundingClientRect();
            return { row: [rowBox.width, rowBox.height], bar: [bar.offsetWidth, bar.offsetHeight], left: nav.left - scroller.left, middle: nav.top + nav.height / 2 - (scroller.top + scroller.height / 2), tooTall: nav.height > Math.min(scroller.height * 0.7, 640) + 1 };
          });
          expect(geometry.row).toEqual([30, 10]);
          expect(geometry.bar).toEqual([26, 2]);
          expect(geometry.left).toBeLessThanOrEqual(8);
          expect(Math.abs(geometry.middle)).toBeLessThanOrEqual(2);
          expect(geometry.tooTall).toBe(false);

          // S6: the bars of the turns in view are stronger than the others
          const colour = (index: number) => bars.nth(index).locator("span").evaluate((el) => getComputedStyle(el).backgroundColor);
          const visibleBars = await bars.evaluateAll((nodes) => nodes.flatMap((node, index) => (node.getAttribute("data-visible") === "true" ? [index] : [])));
          expect(visibleBars.length, "the turns in view").toBeGreaterThan(0);
          expect(visibleBars).toContain(8);
          expect(visibleBars).not.toContain(0);
          expect(await colour(8)).not.toBe(await colour(0));
          await shot(page, theme, "rail");

          // S7: hovering shows the tooltip card: the user's line, the reply clamped to three lines; the bars near the pointer grow
          await bars.nth(4).hover();
          const tip = page.getByTestId("turn-rail-tooltip");
          await expect(tip).toBeVisible();
          await expect(tip.getByTestId("turn-rail-user")).toHaveText("第 5 个问题：这周的进展怎么样？");
          await expect(tip.getByTestId("turn-rail-reply")).toContainText("第 5 轮的回复。这一周主要完成了三件事");
          const tipLook = await tip.evaluate((el) => {
            const user = el.querySelector('[data-testid="turn-rail-user"]') as HTMLElement;
            const reply = el.querySelector('[data-testid="turn-rail-reply"]') as HTMLElement;
            const box = el.getBoundingClientRect();
            const row = document.querySelector('[data-testid="turn-rail"]')!.getBoundingClientRect();
            return { width: box.width, radius: getComputedStyle(el).borderTopLeftRadius, userWrap: getComputedStyle(user).whiteSpace, clamp: getComputedStyle(reply).webkitLineClamp, clipped: reply.scrollHeight > reply.clientHeight, lines: Math.round(reply.clientHeight / Number.parseFloat(getComputedStyle(reply).lineHeight)), gap: box.left - row.right, inside: box.top >= 0 && box.bottom <= window.innerHeight };
          });
          expect(tipLook.width).toBe(320);
          expect(tipLook.radius).toBe("12px");
          expect(tipLook.userWrap).toBe("nowrap");
          expect(tipLook.clamp).toBe("3");
          expect(tipLook.clipped, "a long reply is cut").toBe(true);
          expect(tipLook.lines).toBe(3);
          expect(tipLook.inside).toBe(true);
          const widthsOf = () => Promise.all([4, 5, 6, 7, 8].map((index) => bars.nth(index).locator("span").evaluate((el) => el.getBoundingClientRect().width)));
          await expect.poll(async () => (await widthsOf())[0], { message: "the hovered bar grows to the full 26px" }).toBeCloseTo(26, 0);
          const widths = await widthsOf();
          expect(widths[0], "the hovered bar is the longest").toBeGreaterThan(widths[1]);
          expect(widths[1], "falloff: next bar is shorter").toBeGreaterThan(widths[2]);
          expect(widths[2]).toBeGreaterThan(widths[3]);
          expect(widths[4], "far bars are at rest").toBeCloseTo(6, 0);
          await shot(page, theme, "rail-tooltip");

          // keyboard: a bar is a button; focus shows the same tooltip
          await page.mouse.move(700, 450);
          await bars.nth(2).focus();
          await expect(tip.getByTestId("turn-rail-user")).toHaveText("第 3 个问题：这周的进展怎么样？");
          await page.mouse.move(700, 450);

          // S6: a click jumps to the turn. Far away (more than 1.5 screens) it is instant; near, it glides there
          // turn n is the (n+1)th message of yours: the goal comes first
          const topOf = (n: number) => page.getByTestId("user-message").nth(n).evaluate((el) => el.getBoundingClientRect().top - document.querySelector('[data-testid="conversation-scroller"]')!.getBoundingClientRect().top);
          await bars.nth(0).click();
          await expect.poll(() => topOf(1)).toBeLessThanOrEqual(24);
          expect(await topOf(1)).toBeGreaterThanOrEqual(0);
          await expect(page.getByRole("button", { name: "回到底部" })).toBeVisible();
          await bars.nth(1).click();
          await expect.poll(() => topOf(2), { timeout: 5000 }).toBeLessThanOrEqual(24);
          expect(await topOf(2)).toBeGreaterThanOrEqual(0);
          await expect(bars.nth(1)).toHaveAttribute("data-visible", "true");
          await bars.nth(8).click();
          // the last turn cannot reach the top (there is nothing below it to scroll): it lands at the bottom, back in view, and the button goes
          await expect.poll(async () => (await scrollerState(page)).distance, { timeout: 5000 }).toBeLessThanOrEqual(2);
          await expect(page.getByRole("button", { name: "回到底部" })).toHaveCount(0);
          expect(await topOf(9)).toBeGreaterThan(0);
        });

        test("rail: instant jump when the turn is far away", async ({ page }) => {
          test.skip(phone, "no rail on a phone");
          await open(page, 9, false);
          await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
          // sample the scroll position right after the click: a far target has already arrived, a near one has not
          await page.getByTestId("turn-rail").getByRole("button").nth(0).evaluate((el) => (el as HTMLElement).click());
          const gap = await page.getByTestId("user-message").nth(1).evaluate((el) => el.getBoundingClientRect().top - document.querySelector('[data-testid="conversation-scroller"]')!.getBoundingClientRect().top);
          expect(Math.round(gap), "already there on the next frame, not gliding").toBe(16);
        });
      });
    }
  });
}

test.describe("scroll: reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the dots hold still and the button jumps", async ({ page }) => {
    const scene = conversation(8, true);
    await mockBackend(page, scene.events, "RUNNING");
    await page.goto(`/tasks/${TASK_ID}`);
    await expect.poll(async () => (await scrollerState(page)).distance).toBeLessThanOrEqual(2);
    await wheelUp(page, 900);
    const button = page.getByRole("button", { name: "回到底部" });
    await expect(button).toBeVisible();
    expect(await button.locator(".typing-dot").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await button.click();
    // no gliding: the very next frame is already at the bottom
    expect((await scrollerState(page)).distance).toBeLessThanOrEqual(2);
  });
});
