/**
 * An agent reply as a live activity timeline (route-mocked API, a fake EventSource the test can push events into).
 * Screenshots go to e2e-artifacts/activity/<theme>-<width>x<height>-<scene>.png (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   A1 the narration of a model round and its tool calls are not in the order they happened (the text lands after the tools, or the final answer is not last)
 *   A2 consecutive reads/searches/commands are not one group with the summary 已读取 N 个文件 · …, or a group opens without a click
 *   A3 a running call has no shimmer label (正在读取 foo.ts), the shimmer still moves under reduced motion, or an error / a refusal does not read as one
 *   A4 a row cannot be opened to its arguments and result; a command does not read as `$ command`; an open row closes when more events stream in
 *   A5 the 已处理 header is wrong (duration, cancelled wording, ticking), is not a toggle once the reply is over, or hides the final answer when folded
 *   A6 a TodoWrite call is not a plan row (已创建计划，共 N 项 / 已更新计划 · 已完成 x/N 项) that opens to its items
 *   A7 the action row (copy, time in the three formats, expert, token usage) is missing, shows a figure the events do not have, or is not revealed by hover / always on the last reply and on touch
 *   A10 messages are not 32-40px apart (the hidden action row reserves height), or the row cannot be reached from its message
 *   A8 the user's bubble is not right-aligned, 20px round, at most 78% wide, with copy and time on hover
 *   A9 the page scrolls sideways at either width, or renders a font size outside the scale
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/activity";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const FONT_SIZES = new Set([12, 13, 14, 16, 20, 24]);
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const task = (status: string, extra: Record<string, unknown> = {}) => ({
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "补全待办应用",
  goal: "给待办应用补上状态提示，并跑一遍测试。",
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
  ...extra,
});
const plan = { plan_version: 1, hash: `sha256:${"a".repeat(64)}`, nodes: [{ node_id: "n_1", type: "agent_turn", title: "补全待办应用", status: "COMPLETED", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: true, attempt_count: 1 }], edges: [] };
const expert = { expert_id: "writer", ref: "writer@1", version: 1, name: "文案专家", instructions: "你是一名文案专家。", model: "test-model", connector_ids: [], skill_ids: [], created_at: "2026-10-03T08:00:00Z" };

type Ev = { seq: number; after_seq?: number; event_id: string; task_id: string; type: string; source: string; payload: Record<string, unknown>; occurred_at: string; entity?: unknown };

/** Durable events get the next seq; ephemeral ones (streamed text, a call's start) follow the durable event before them, as control sends them. */
function stream() {
  const events: Ev[] = [];
  let seq = 0;
  let eph = 0;
  const base = (type: string, payload: Record<string, unknown>, at: string): Ev => ({ seq: 0, event_id: "", task_id: TASK_ID, type, source: "worker", payload, occurred_at: at });
  return {
    events,
    durable(type: string, payload: Record<string, unknown>, at: string) {
      seq += 1;
      events.push({ ...base(type, payload, at), seq, event_id: `evt_${seq}` });
    },
    live(type: string, payload: Record<string, unknown>, at: string) {
      eph += 1;
      events.push({ ...base(type, payload, at), seq: 0, after_seq: seq, event_id: `eph_${eph}` });
    },
  };
}

const T = (clock: string, day = "05") => `2026-10-${day}T${clock}Z`;
const call = (id: string, name: string, args: Record<string, unknown> | string) => ({ attempt_id: "att_c", tool_call_id: id, tool_name: name, args_preview: typeof args === "string" ? args : JSON.stringify(args) });
const TODOS = (states: string[]) => JSON.stringify({ todos: ["补上状态提示", "改 App.tsx", "跑测试"].map((content, i) => ({ content, status: states[i] })) });
const FINAL = "全部完成：App 已经补上状态提示，测试 3 项全部通过。";

/** Two earlier replies (on other days, for the time formats), then the one under test, in the order the stream sends them. */
function conversation(scene: "running" | "done" | "stopped") {
  const s = stream();
  s.durable("task.created", { goal: "你好", title: "补全待办应用" }, T("08:00:00", "03"));
  s.durable("attempt.started", { attempt_id: "att_a", node_id: "n_1", attempt_no: 1, profile: "writer@1" }, T("08:00:00", "03"));
  s.durable("message.agent_final", { attempt_id: "att_a", text: "你好，需要我做什么？" }, T("08:00:04", "03"));
  s.durable("attempt.finished", { attempt_id: "att_a", node_id: "n_1", outcome: "completed", usage: { tokens_in: 0, tokens_out: 0 } }, T("08:00:05", "03"));
  s.durable("message.user", { text: "再问一句", delivery: "queue" }, T("08:00:00", "04"));
  s.durable("attempt.started", { attempt_id: "att_b", node_id: "n_1", attempt_no: 2, profile: "writer@1" }, T("08:00:00", "04"));
  s.durable("message.agent_final", { attempt_id: "att_b", text: "好的，我在。" }, T("08:00:08", "04"));
  s.durable("attempt.finished", { attempt_id: "att_b", node_id: "n_1", outcome: "completed" }, T("08:00:09", "04"));
  s.durable("message.user", { text: "给待办应用补上状态提示，并跑一遍测试。", delivery: "queue" }, T("08:00:00"));
  s.durable("attempt.started", { attempt_id: "att_c", node_id: "n_1", attempt_no: 3, profile: "writer@1" }, T("08:00:00"));
  // round 1: words, then a glob, two reads and a grep: one group
  s.live("agent.token_delta", { attempt_id: "att_c", block_id: "b1", text: "我先看看项目结构，" }, T("08:00:03"));
  s.live("agent.token_delta", { attempt_id: "att_c", block_id: "b1", text: "再读几个关键文件。" }, T("08:00:04"));
  s.live("tool.call_started", call("tc1", "Glob", { path: "/workspace/src", pattern: "**/*" }), T("08:00:05"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc1", tool_name: "Glob", state: "success", result_preview: "main.ts\nApp.tsx\nApp.test.tsx" }, T("08:00:06"));
  s.live("tool.call_started", call("tc2", "Read", { file_path: "/workspace/src/main.ts" }), T("08:00:07"));
  s.live("tool.call_started", call("tc3", "Read", { file_path: "/workspace/src/App.tsx" }), T("08:00:07"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc2", tool_name: "Read", state: "success", result_preview: "import { App } from './App';" }, T("08:00:08"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc3", tool_name: "Read", state: "success", result_preview: "export function App() { return null; }" }, T("08:00:08"));
  s.live("tool.call_started", call("tc4", "Grep", { pattern: "useState", path: "/workspace/src" }), T("08:00:09"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc4", tool_name: "Grep", state: "success", result_preview: "App.tsx:3" }, T("08:00:10"));
  // round 2: words, the plan, an edit and a command: a plan row, then another group
  s.live("agent.token_delta", { attempt_id: "att_c", block_id: "b2", text: "读完了，先列个计划再动手。" }, T("08:00:12"));
  s.live("tool.call_started", call("tc5", "TodoWrite", '{"todos":[{"content":"补上状'), T("08:00:13"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc5", tool_name: "TodoWrite", state: "success", args_preview: TODOS(["in_progress", "pending", "pending"]), result_preview: "ok" }, T("08:00:14"));
  s.live("tool.call_started", call("tc6", "Edit", { file_path: "/workspace/src/App.tsx", old_string: "return null", new_string: "return <p>状态</p>" }), T("08:00:20"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc6", tool_name: "Edit", state: "success", result_preview: "edited" }, T("08:00:21"));
  if (scene === "running") {
    // still going: a command is running and no answer yet
    s.live("tool.call_started", call("tc7", "Bash", { command: "pnpm test", description: "运行测试" }), T("08:00:30"));
    return s.events;
  }
  s.live("tool.call_started", call("tc7", "Bash", { command: "pnpm test", description: "运行测试" }), T("08:00:30"));
  if (scene === "stopped") {
    s.durable("attempt.finished", { attempt_id: "att_c", node_id: "n_1", outcome: "cancelled" }, T("08:01:02"));
    return s.events;
  }
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc7", tool_name: "Bash", state: "success", result_preview: "3 passed" }, T("08:00:50"));
  s.live("tool.call_started", call("tc8", "TodoWrite", '{"todos":[{"content":"补上状'), T("08:00:55"));
  s.durable("tool.call_finished", { attempt_id: "att_c", tool_call_id: "tc8", tool_name: "TodoWrite", state: "success", args_preview: TODOS(["completed", "completed", "completed"]), result_preview: "ok" }, T("08:00:56"));
  s.live("agent.token_delta", { attempt_id: "att_c", block_id: "b3", text: "全部完成：App 已经补上状态提示，" }, T("08:01:00"));
  s.durable("message.agent_final", { attempt_id: "att_c", text: FINAL }, T("08:01:40"));
  s.durable("attempt.finished", { attempt_id: "att_c", node_id: "n_1", outcome: "completed", usage: { tokens_in: 12345, tokens_out: 678, tool_calls: 7, wall_s: 101 } }, T("08:01:41"));
  return s.events;
}

async function mockBackend(page: Page, events: Ev[], status: string, now: string) {
  // Time flows from `now`, so 正在处理 12s and the time under a reply do not depend on the day the test runs.
  await page.clock.install({ time: new Date(now) });
  await page.clock.resume();
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

/** Push one more event into the open stream, as the server would. */
const push = (page: Page, event: Ev) => page.evaluate((item) => (window as unknown as { __source: { onmessage: (e: { data: string }) => void } }).__source.onmessage({ data: JSON.stringify(item) }), event);

const NOW_DONE = "2026-10-05T10:00:00Z";
const NOW_RUNNING = "2026-10-05T08:00:34Z";

const sizesOf = (page: Page) =>
  page.evaluate(() => {
    const sizes = new Set<number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (parent && text.textContent?.trim() && parent.getClientRects().length > 0 && !["SCRIPT", "STYLE"].includes(parent.tagName)) sizes.add(Number.parseFloat(getComputedStyle(parent).fontSize));
    }
    return [...sizes];
  });

for (const viewport of VIEWPORTS) {
  test.describe(`activity @ ${viewport.name}`, () => {
    const phone = viewport.width < 640;
    test.use({ viewport: { width: viewport.width, height: viewport.height }, timezoneId: "Asia/Shanghai", ...(phone ? { hasTouch: true, isMobile: true } : {}) });

    async function shot(page: Page, theme: string, scene: string) {
      mkdirSync(OUT, { recursive: true });
      await page.waitForTimeout(150);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, `${scene}: page scrolls sideways`).toBeLessThanOrEqual(inner);
      expect((await sizesOf(page)).filter((size) => !FONT_SIZES.has(size)), `${scene}: font sizes outside the scale`).toEqual([]);
      await page.screenshot({ path: join(OUT, `${theme}-${viewport.name}-${scene}.png`) });
    }

    for (const theme of ["light", "dark"] as const) {
      test.describe(theme, () => {
        test.beforeEach(async ({ page }) => {
          if (theme === "dark") await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ theme: "深色" })));
        });

        test("a finished reply: order, groups, plan, header, actions", async ({ page }) => {
          await mockBackend(page, conversation("done"), "COMPLETED", NOW_DONE);
          await page.goto(`/tasks/${TASK_ID}`);
          if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
          const reply = page.getByTestId("agent-message").last();

          // A5: 已处理 with the duration, folded: the process is hidden, the answer is not
          await expect(reply.getByTestId("process-label")).toHaveText("已处理 1m 41s");
          await expect(reply.getByTestId("process-header")).toHaveAttribute("data-open", "false");
          await expect(reply.getByTestId("activity-timeline")).toHaveCount(0);
          await expect(reply.getByTestId("final-output")).toHaveText(FINAL);
          await shot(page, theme, "done-collapsed");

          await reply.getByTestId("process-header").getByRole("button").click();
          await expect(reply.getByTestId("process-header")).toHaveAttribute("data-open", "true");
          const timeline = reply.getByTestId("activity-timeline");
          await expect(timeline).toBeVisible();

          // A1/A2/A6: the words of each round, then what that round did, in order; the answer after all of it
          const parts = await timeline.locator("> *").evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute("data-testid")}|${(node.querySelector("button")?.textContent ?? node.textContent ?? "").trim()}`));
          expect(parts).toEqual([
            "activity-text|我先看看项目结构，再读几个关键文件。",
            "activity-group|已读取 2 个文件 · 已搜索 1 次 · 已列出 1 个目录",
            "activity-text|读完了，先列个计划再动手。",
            "activity-row|已创建计划，共 3 项",
            "activity-group|已编辑 1 个文件 · 已运行 1 个命令",
            "activity-row|已更新计划 · 已完成 3/3 项",
          ]);
          const order = await reply.evaluate((el) => {
            const answer = el.querySelector('[data-testid="final-output"]')!;
            const process = el.querySelector('[data-testid="process"]')!;
            return Boolean(process.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING);
          });
          expect(order, "the final answer comes after the process").toBe(true);

          // a group opens under a guide line; its rows are one line, past tense, subject from the arguments
          const group = timeline.getByTestId("activity-group").first();
          await expect(group.getByTestId("activity-row")).toHaveCount(0);
          await group.getByRole("button").first().click();
          const leaves = group.getByTestId("activity-row");
          await expect(leaves).toHaveCount(4);
          await expect(leaves.nth(0).getByRole("button")).toHaveText("已列出 src/");
          await expect(leaves.nth(1).getByRole("button")).toHaveText("已读取 src/main.ts");
          await expect(leaves.nth(3).getByRole("button")).toHaveText("已搜索 “useState”");
          const guide = await group.getByTestId("group-items").evaluate((el) => ({ border: getComputedStyle(el).borderLeftWidth, margin: getComputedStyle(el).marginLeft, pad: getComputedStyle(el).paddingLeft }));
          expect(guide).toEqual({ border: "1px", margin: "8px", pad: "12px" });
          const rowBox = await leaves.nth(1).getByRole("button").boundingBox();
          expect(rowBox!.height, "one-line row, 28px high").toBeGreaterThanOrEqual(28);
          expect(rowBox!.height).toBeLessThan(40);
          const rowStyle = await leaves.nth(1).getByRole("button").evaluate((el) => ({ size: getComputedStyle(el).fontSize, color: getComputedStyle(el).color, icon: el.querySelector("svg")!.getBoundingClientRect().width, title: el.getAttribute("title") }));
          expect(rowStyle.size).toBe("14px");
          expect(rowStyle.icon).toBe(16);
          expect(rowStyle.title).toBe("已读取 src/main.ts");

          // the settled group wears the priority icon: a change over a command over a search over a read
          await expect(timeline.getByTestId("activity-group").nth(0).getByRole("button").first()).toHaveAttribute("data-icon-category", "search");
          await expect(timeline.getByTestId("activity-group").nth(1).getByRole("button").first()).toHaveAttribute("data-icon-category", "edit");

          // A4: every row opens to its arguments and result, in a muted scrolling block
          await leaves.nth(1).getByRole("button").click();
          const detail = leaves.nth(1).getByTestId("step-detail");
          await expect(detail).toContainText('"file_path": "/workspace/src/main.ts"');
          await expect(detail).toContainText("import { App } from './App';");
          const block = await detail.evaluate((el) => ({ max: getComputedStyle(el).maxHeight, overflow: getComputedStyle(el).overflowY, radius: getComputedStyle(el).borderTopLeftRadius, font: getComputedStyle(el).fontFamily }));
          expect(block.max).toBe("256px");
          expect(block.overflow).toBe("auto");
          expect(block.radius).toBe("8px");
          expect(block.font).toMatch(/mono/i);
          await leaves.nth(1).getByRole("button").click();
          await expect(detail).toHaveCount(0);

          // a command reads as `$ command`, its output and how it ended
          const second = timeline.getByTestId("activity-group").nth(1);
          await second.getByRole("button").first().click();
          const command = second.locator('[data-tool="Bash"]');
          await expect(command.getByRole("button")).toHaveText("已运行命令 运行测试");
          await command.getByRole("button").click();
          await expect(command.getByTestId("step-detail")).toContainText("$ pnpm test");
          await expect(command.getByTestId("step-detail")).toContainText("3 passed");
          await expect(command.getByTestId("step-detail")).toContainText("已完成");

          // A6: the plan row opens to its items with their status
          const planRows = timeline.locator('[data-tool="TodoWrite"]');
          await planRows.first().getByRole("button").click();
          await expect(planRows.first().getByTestId("plan-items").locator("li")).toHaveText(["补上状态提示", "改 App.tsx", "跑测试"]);
          await expect(planRows.first().locator('li[data-status="in_progress"]')).toHaveCount(1);
          await expect(planRows.first().locator('li[data-status="pending"]')).toHaveCount(2);
          await shot(page, theme, "done-expanded");

          // A5: folding again leaves the answer, and a second unfold finds the rows as they were (state is kept by id)
          await reply.getByTestId("process-header").getByRole("button").click();
          await expect(reply.getByTestId("activity-timeline")).toHaveCount(0);
          await expect(reply.getByTestId("final-output")).toBeVisible();
          await reply.getByTestId("process-header").getByRole("button").click();
          await expect(reply.getByTestId("activity-timeline").locator('[data-testid="step-detail"]')).toHaveCount(1);
          await expect(reply.getByTestId("activity-timeline").getByTestId("plan-items")).toHaveCount(1);

          // A7: the action row of the last reply is always there: copy, time (today H:mm), expert, usage
          const actions = reply.getByTestId("reply-actions");
          await expect(actions).toHaveCSS("opacity", "1");
          await expect(actions.getByRole("button", { name: "复制回复" })).toBeVisible();
          await expect(actions).toContainText("16:01");
          await expect(actions).toContainText("文案专家");
          const popover = actions.getByTestId("usage-popover");
          await expect(popover).toBeHidden();
          await actions.getByRole("button", { name: "用量" }).focus();
          await expect(popover).toBeVisible();
          await expect(popover).toContainText("输入");
          await expect(popover).toContainText("12,345");
          await expect(popover).toContainText("输出");
          await expect(popover).toContainText("678");
          await expect(popover).toContainText("总计");
          await expect(popover).toContainText("13,023");
          await expect(popover).not.toContainText("缓存");
          expect(await popover.locator("dd").first().evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");
        });

        test("earlier replies: time formats, action row on hover, no usage the events do not have", async ({ page }) => {
          await mockBackend(page, conversation("done"), "COMPLETED", NOW_DONE);
          await page.goto(`/tasks/${TASK_ID}`);
          const [first, second] = [page.getByTestId("agent-message").nth(0), page.getByTestId("agent-message").nth(1)];
          // A7: the three time formats
          await expect(first.getByTestId("reply-actions")).toContainText("10月3日 16:00");
          await expect(second.getByTestId("reply-actions")).toContainText("昨天 16:00");
          // a reply with no process is not a toggle; zero usage is no usage
          await expect(first.getByTestId("process-label")).toHaveText("已处理 5s");
          await expect(first.getByTestId("process-header").getByRole("button")).toHaveCount(0);
          await expect(first.getByRole("button", { name: "用量" })).toHaveCount(0);
          await expect(first.getByTestId("final-output")).toHaveText("你好，需要我做什么？");
          const actions = first.getByTestId("reply-actions");
          if (phone) {
            // no hover on a touch screen: always there
            await expect(actions).toHaveCSS("opacity", "1");
          } else {
            await expect(actions).toHaveCSS("opacity", "0");
            await first.hover();
            await expect(actions).toHaveCSS("opacity", "1");
            await page.mouse.move(2, 2);
            await expect(actions).toHaveCSS("opacity", "0");
            // keyboard focus reveals it too
            await actions.getByRole("button", { name: "复制回复" }).focus();
            await expect(actions).toHaveCSS("opacity", "1");
          }
        });

        test("messages sit 32-40px apart: the action row hangs in the gap instead of adding height", async ({ page }) => {
          await mockBackend(page, conversation("done"), "COMPLETED", NOW_DONE);
          await page.goto(`/tasks/${TASK_ID}`);
          await expect(page.getByTestId("agent-message")).toHaveCount(3);
          const boxes = await page.locator('[data-testid="user-message"], [data-testid="agent-message"]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.getAttribute("data-testid"), top: node.getBoundingClientRect().top + window.scrollY, bottom: node.getBoundingClientRect().bottom + window.scrollY })));
          expect(boxes.map((box) => box.id)).toEqual(["user-message", "agent-message", "user-message", "agent-message", "user-message", "agent-message"]);
          const gaps = boxes.slice(1).map((box, i) => Math.round(box.top - boxes[i].bottom));
          if (phone) {
            // touch: the row is part of the flow, so the gap is the spacing plus the row (28px)
            for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(36);
          } else {
            for (const gap of gaps) {
              expect(gap).toBeGreaterThanOrEqual(32);
              expect(gap).toBeLessThanOrEqual(40);
            }
            // the row is inside that gap, just below its message, so the pointer can get to it
            const first = page.getByTestId("agent-message").first();
            const message = (await first.boundingBox())!;
            const actions = page.getByTestId("agent-message").first().getByTestId("reply-actions");
            const row = (await actions.boundingBox())!;
            expect(Math.abs(row.y - (message.y + message.height))).toBeLessThanOrEqual(1);
            await first.hover();
            await page.mouse.move(message.x + 20, message.y + message.height + 12, { steps: 4 });
            await expect(actions).toHaveCSS("opacity", "1");
            await actions.getByRole("button", { name: "复制回复" }).hover();
            await expect(actions).toHaveCSS("opacity", "1");
          }
        });

        test("the user's bubble", async ({ page }) => {
          await mockBackend(page, conversation("done"), "COMPLETED", NOW_DONE);
          await page.goto(`/tasks/${TASK_ID}`);
          const bubble = page.getByTestId("user-message").last();
          const text = bubble.locator("div.bg-secondary");
          await expect(text).toHaveText("给待办应用补上状态提示，并跑一遍测试。");
          // A8: 20px round, right-aligned, at most 78% of the column
          expect(await text.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("20px");
          const column = (await page.getByTestId("conversation-column").boundingBox())!;
          const box = (await text.boundingBox())!;
          expect(box.x + box.width, "right-aligned").toBeGreaterThan(column.x + column.width - 2);
          expect(box.width).toBeLessThanOrEqual(column.width * 0.78 + 1);
          const padding = await text.evaluate((el) => ({ x: getComputedStyle(el).paddingLeft, y: getComputedStyle(el).paddingTop }));
          expect(padding).toEqual({ x: "16px", y: "8px" });
          const actions = bubble.getByTestId("user-actions");
          if (phone) await expect(actions).toHaveCSS("opacity", "1");
          else {
            await expect(actions).toHaveCSS("opacity", "0");
            await bubble.hover();
            await expect(actions).toHaveCSS("opacity", "1");
          }
          await expect(actions.getByRole("button", { name: "复制消息" })).toBeVisible();
          await expect(actions).toContainText("16:00");
        });

        test("a running reply: shimmer, ticking header, open rows stay open while events stream in", async ({ page }) => {
          await mockBackend(page, conversation("running"), "RUNNING", NOW_RUNNING);
          await page.goto(`/tasks/${TASK_ID}`);
          const reply = page.getByTestId("agent-message").last();

          // A5: running: expanded, not a toggle, the header counts up
          const label = reply.getByTestId("process-label");
          await expect(label).toHaveText(/^正在处理 3\ds$/);
          await expect(reply.getByTestId("process-header").getByRole("button")).toHaveCount(0);
          const first = await label.textContent();
          await expect(label).not.toHaveText(first!, { timeout: 4000 });
          const timeline = reply.getByTestId("activity-timeline");
          await expect(timeline).toBeVisible();

          // A3: a group shows the call that is running while one is, as a shimmer label
          const group = timeline.getByTestId("activity-group").last();
          await expect(group).toHaveAttribute("data-running", "true");
          await expect(group.getByTestId("group-summary")).toHaveText("正在运行命令 运行测试");
          await expect(group.locator(".shimmer-text")).toHaveCount(1);
          expect(await group.locator(".shimmer-text").evaluate((el) => getComputedStyle(el).animationName)).toBe("shimmer");
          // reduced motion: no animation, still readable
          await page.emulateMedia({ reducedMotion: "reduce" });
          const calm = await group.locator(".shimmer-text").evaluate((el) => ({ animation: getComputedStyle(el).animationName, color: getComputedStyle(el).color }));
          expect(calm.animation).toBe("none");
          expect(calm.color).not.toBe("rgba(0, 0, 0, 0)");
          await page.emulateMedia({ reducedMotion: "no-preference" });

          // A4: open a call inside the group, then more events arrive: it stays open, and the group (named by its first call) is the same one
          await group.getByRole("button").first().click();
          await expect(group.locator('[data-tool="Bash"]').getByRole("button")).toHaveText("正在运行命令 运行测试");
          await expect(group.locator('[data-tool="Bash"] .shimmer-text')).toHaveCount(1);
          await group.locator('[data-tool="Edit"]').getByRole("button").click();
          await expect(group.locator('[data-tool="Edit"]').getByTestId("step-detail")).toContainText("return <p>状态</p>");
          await push(page, { seq: 40, event_id: "evt_40", task_id: TASK_ID, type: "tool.call_finished", source: "worker", payload: { attempt_id: "att_c", tool_call_id: "tc7", tool_name: "Bash", state: "success", result_preview: "3 passed" }, occurred_at: T("08:00:50") });
          await push(page, { seq: 0, after_seq: 40, event_id: "eph_90", task_id: TASK_ID, type: "tool.call_started", source: "worker", payload: call("tc9", "Read", { file_path: "/workspace/README.md" }), occurred_at: T("08:00:51") });
          await expect(group.locator('[data-tool="Read"]')).toHaveText(/正在读取 README.md/);
          // the header names the call that is running, so it wears that call's icon, not the group's priority icon (edit)
          await expect(group.getByRole("button").first()).toHaveAttribute("data-icon-category", "read");
          await expect(group.getByTestId("group-summary")).toHaveText("正在读取 README.md");
          await expect(group.locator('[data-tool="Edit"]').getByTestId("step-detail")).toBeVisible();
          await expect(group.locator('[data-tool="Bash"]').getByRole("button")).toHaveText("已运行命令 运行测试");
          await expect(timeline.getByTestId("activity-group")).toHaveCount(2);
          // chevrons: hidden until hover or focus, always on an open row, always on a touch screen
          await page.mouse.move(2, 2);
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          // (polled: the opacity fades over 150ms)
          await expect
            .poll(async () => {
              const rows = await reply.locator('[data-testid="activity-timeline"] button[aria-expanded]').evaluateAll((buttons) =>
                buttons.map((button) => [button.getAttribute("aria-expanded"), getComputedStyle(button.querySelector("svg:last-of-type")!).opacity]),
              );
              return rows.length > 4 && rows.every(([expanded, opacity]) => opacity === (expanded === "true" || phone ? "1" : "0"));
            })
            .toBe(true);
          await shot(page, theme, "running");

          // the last words of the round that has streamed so far stay where they are until a call follows them
          await push(page, { seq: 0, after_seq: 40, event_id: "eph_91", task_id: TASK_ID, type: "agent.token_delta", source: "worker", payload: { attempt_id: "att_c", block_id: "b9", text: "最后核对一遍。" }, occurred_at: T("08:00:52") });
          await expect(reply.getByTestId("live-output")).toHaveText("最后核对一遍。");
          await expect(timeline.getByTestId("activity-text")).toHaveCount(2);
        });

        test("a reply that has put nothing out yet is thinking; calls that failed or were refused say so", async ({ page }) => {
          const s = stream();
          s.durable("task.created", { goal: "清理构建目录", title: "清理" }, T("08:00:00"));
          s.durable("attempt.started", { attempt_id: "att_c", node_id: "n_1", attempt_no: 1, profile: "writer@1" }, T("08:00:00"));
          s.live("agent.thinking_delta", { attempt_id: "att_c", block_id: "t1", text: "先看看有什么" }, T("08:00:01"));
          await mockBackend(page, s.events, "RUNNING", NOW_RUNNING);
          await page.goto(`/tasks/${TASK_ID}`);
          const reply = page.getByTestId("agent-message").last();
          // A5: before any output the header is a shimmering 正在思考, and there is no timeline yet
          await expect(reply.getByTestId("process-label")).toHaveText("正在思考");
          await expect(reply.getByTestId("process-label")).toHaveClass(/shimmer-text/);
          await expect(reply.getByTestId("activity-timeline")).toHaveCount(0);

          // A3: an error reads as a failure with a danger icon, a refusal as 已拒绝, and they are single rows (no group header)
          await push(page, { seq: 0, after_seq: 2, event_id: "eph_50", task_id: TASK_ID, type: "tool.call_started", source: "worker", payload: call("e1", "Read", { file_path: "/workspace/src/missing.ts" }), occurred_at: T("08:00:02") });
          await push(page, { seq: 3, event_id: "evt_3", task_id: TASK_ID, type: "tool.call_finished", source: "worker", payload: { attempt_id: "att_c", tool_call_id: "e1", tool_name: "Read", state: "error", result_preview: "File not found" }, occurred_at: T("08:00:03") });
          await push(page, { seq: 0, after_seq: 3, event_id: "eph_51", task_id: TASK_ID, type: "tool.call_started", source: "worker", payload: call("e2", "Skill", { skill: "周报写作" }), occurred_at: T("08:00:04") });
          await push(page, { seq: 4, event_id: "evt_4", task_id: TASK_ID, type: "tool.call_finished", source: "worker", payload: { attempt_id: "att_c", tool_call_id: "e2", tool_name: "Skill", state: "success", result_preview: "loaded" }, occurred_at: T("08:00:05") });
          await push(page, { seq: 0, after_seq: 4, event_id: "eph_52", task_id: TASK_ID, type: "tool.call_started", source: "worker", payload: call("e3", "Bash", { command: "rm -rf build" }), occurred_at: T("08:00:06") });
          await push(page, { seq: 5, event_id: "evt_5", task_id: TASK_ID, type: "tool.call_finished", source: "worker", payload: { attempt_id: "att_c", tool_call_id: "e3", tool_name: "Bash", state: "denied", result_preview: "denied by policy" }, occurred_at: T("08:00:07") });
          const rows = reply.getByTestId("activity-row");
          await expect(rows).toHaveText(["读取失败 src/missing.ts", "已加载技能 周报写作", "已拒绝运行命令 rm -rf build"]);
          await expect(reply.getByTestId("activity-group")).toHaveCount(0);
          await expect(rows.nth(0).locator('[data-icon="error"]')).toHaveCount(1);
          await expect(rows.nth(2).locator('[data-icon="denied"]')).toHaveCount(1);
          await expect(reply.getByTestId("process-label")).toHaveText(/^正在处理 /);
          // the chevron shows on hover and on focus, and stays while the row is open
          const chevron = rows.nth(1).getByRole("button").locator("svg").last();
          if (phone) {
            // touch: no hover to find it by, so a chevron is always there
            await expect(chevron).toHaveCSS("opacity", "1");
          } else {
            await page.mouse.move(2, 2);
            await expect(chevron).toHaveCSS("opacity", "0");
            await rows.nth(1).getByRole("button").hover();
            await expect(chevron).toHaveCSS("opacity", "1");
          }
          await rows.nth(1).getByRole("button").click();
          await page.mouse.move(2, 2);
          await expect(chevron).toHaveCSS("opacity", "1");
          await expect(rows.nth(1).getByTestId("step-detail")).toContainText("周报写作");
        });

        test("a reply the user stopped", async ({ page }) => {
          await mockBackend(page, conversation("stopped"), "CANCELLED", NOW_DONE);
          await page.goto(`/tasks/${TASK_ID}`);
          const reply = page.getByTestId("agent-message").last();
          // A5: the cancelled wording; a call that never ended reads as interrupted, not as running
          await expect(reply.getByTestId("process-label")).toHaveText("你在 1m 2s 后停止了");
          await reply.getByTestId("process-header").getByRole("button").click();
          await reply.getByTestId("activity-group").last().getByRole("button").first().click();
          await expect(reply.locator('[data-tool="Bash"]').getByRole("button")).toHaveText("已中断运行命令 运行测试");
          await expect(reply.locator(".shimmer-text")).toHaveCount(0);
          await expect(reply).toContainText("已停止");
        });
      });
    }
  });
}
