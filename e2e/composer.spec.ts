/**
 * Everything in the composer's slot (route-mocked API, a fake EventSource the test pushes events into).
 * Screenshots go to e2e-artifacts/composer/<theme>-<width>x<height>-<scene>.png (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   C1 a question or an approval is not docked in the composer's slot, or the composer is not hidden + inert while one waits, or its draft is lost
 *   C2 the question card does not follow its flow: options and 自定义回答, 跳过, 下一项 until everything is answered or skipped and then 提交, ‹ › with a counter,
 *      number keys, the answer text that goes out; minimizing does not leave the 「回答 N 个问题」 pill and give the composer back, or the pill does not re-dock with the answers kept
 *   C3 approvals do not queue one at a time with 「‹ 1 / N ›」 (approvals in order, then the question), 1 / 2 do not allow / always allow, or a refusal with a reason does not send the reason
 *   C4 the chat does not keep a one-line marker where an approval was asked (pending, then 已允许 / 已拒绝 / 已取消), or the marker does not bring the card back
 *   C5 the send button does not show send / disabled / stop / continue / sending, or typing while the task runs does not turn stop back into send
 *   C6 「/」 does not open the command list in an empty field (not during IME composition), filtering, ↑/↓ wrap, Enter, Esc and Backspace do not behave, an Enter that
 *      belongs to the IME selects a command, or a command does something the composer cannot already do
 *   C7 the plan pill does not count 已完成 N/M 步, open a popover with the items (and owners in a team), tint the ring when an item failed, hide while a card is docked, or fade out after the work is done
 *   C8 at 390px anything in the toolbar wraps, the send button is clipped, or the page scrolls sideways; the permission and model triggers do not collapse to icons there
 *   C9 any of these breaks in the dark theme, or draws a font size outside the six
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/composer";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const NOW = "2026-10-05T08:00:00Z";
const FONT_SIZES = new Set([12, 13, 14, 16, 20, 24]);
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const baseTask = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理本周发布风险",
  goal: "把本周的发布风险整理成一页摘要，并标出需要我决定的事项。",
  mode: "single",
  status: "WAITING",
  profile: "writer@1",
  plan_version: 1,
  created_by: "user-a",
  created_at: NOW,
  updated_at: NOW,
  budgets: {},
  usage: {},
  pending_approvals: [] as string[],
};
const node = (id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({ node_id: id, type: "agent_turn", title, status, depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: false, attempt_count: 1, ...extra });
const plan = { plan_version: 1, hash: `sha256:${"a".repeat(64)}`, nodes: [node("n_1", "Explore and plan", "COMPLETED", { frozen: true }), node("n_2", "Draft report", "RUNNING", { depends_on: ["n_1"] })], edges: [] };
const expert = { expert_id: "writer", ref: "writer@1", version: 1, name: "文案专家", instructions: "你是一名文案专家。", model: "test-model", connector_ids: [], skill_ids: [], created_at: NOW };
const researcher = { ...expert, expert_id: "research", ref: "research@1", name: "调研专家" };
const reviewer = { ...expert, expert_id: "reviewer", ref: "reviewer@1", name: "评审专家" };
const members = [
  { role: "member-1", label: "主编", expert: "writer@1", name: "文案专家", description: "统筹" },
  { role: "member-2", label: "研究员", expert: "research@1", name: "调研专家", description: "找资料" },
  { role: "member-3", label: "评审员", expert: "reviewer@1", name: "评审专家", description: "把关" },
];
const team = { expert_id: "team1", kind: "team", ref: "team1@1", version: 1, name: "发布风险评审与周报整理专家小队", instructions: "", model: "", connector_ids: [], skill_ids: [], created_at: NOW, leader: "member-1", members };
const teamConfig = { config_version: 2, expert: "writer@1", skills: null, connector_ids: null, mode: "default", team_ref: "team1@1", team: { ref: "team1@1", leader: "member-1", members } };

let seq = 0;
const event = (type: string, payload: Record<string, unknown>) => {
  seq += 1;
  return { seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: NOW };
};

/** A single agent that has said something and is now parked: the base every scene starts from. */
function baseEvents() {
  seq = 0;
  return [
    event("task.created", { goal: baseTask.goal, title: baseTask.title }),
    event("attempt.started", { attempt_id: "att_1", node_id: "n_2", attempt_no: 1, profile: "writer@1" }),
    event("message.agent_final", { attempt_id: "att_1", text: "我先看了发布计划，下面有几件事要和你确认。" }),
  ];
}

const bashApproval = (id = "apr_1", detail = "printf '风险排序\\n' > risks.md") =>
  event("approval.requested", { approval_id: id, node_id: "n_2", attempt_id: "att_1", subject: { kind: "tool_call", summary: "Bash", detail, allow_rule: { tool_name: "Bash", rule_content: "printf:*" } } });
const nodeApproval = (id = "apr_2") => event("approval.requested", { approval_id: id, node_id: "n_2", attempt_id: "att_1", subject: { kind: "node_approval", summary: "把摘要发给全部评审人？", detail: "发送前请确认收件人范围。" } });
const questions = [
  { header: "公司", question: "公司名称用哪一个？", options: [{ label: "迈能", description: "对外使用的品牌名" }, { label: "迈能科技" }, { label: "其他" }], multi_select: false },
  { header: "页面", question: "需要哪些页面？", options: [{ label: "首页" }, { label: "关于我们" }, { label: "联系页" }], multi_select: true },
  { header: "风格", question: "整体风格？", options: [{ label: "简约" }, { label: "商务" }], multi_select: false },
];
const askEvent = (withQuestions = true) => event("attempt.parked", { attempt_id: "att_1", node_id: "n_2", reason: "input", question: "Agent 需要你回答几个问题：\n1. 公司名称\n2. 页面\n3. 风格", ...(withQuestions ? { questions } : {}) });
const decided = (id: string, status: "APPROVED" | "REJECTED" | "CANCELLED") => event("approval.decided", { approval_id: id, status, always: false });
const todoCall = (states: string[]) => event("tool.call_finished", { attempt_id: "att_1", tool_call_id: `tc_${seq}`, tool_name: "TodoWrite", state: "success", args_preview: JSON.stringify({ todos: ["整理风险清单", "核对证书到期时间", "写成一页摘要"].map((content, i) => ({ content, status: states[i] })) }), result_preview: "ok" });

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}
interface Scene {
  events?: ReturnType<typeof event>[];
  task?: Record<string, unknown>;
  teamed?: boolean;
  /** Milliseconds a POST to /messages is held, so the sending state can be seen. */
  slowMessages?: number;
  theme?: "dark";
  plan?: typeof plan;
}

async function mockBackend(page: Page, scene: Scene = {}) {
  const state = { task: { ...baseTask, ...scene.task } as Record<string, unknown> & { pending_approvals: string[] } };
  const calls: Call[] = [];
  const feed = scene.events ?? baseEvents();
  await page.addInitScript((items) => {
    class FakeEventSource {
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        Object.assign(window, { __push: (item: unknown) => this.onmessage?.({ data: JSON.stringify(item) }) });
        setTimeout(() => {
          this.onopen?.({});
          for (const item of items) this.onmessage?.({ data: JSON.stringify(item) });
        }, 20);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, feed);
  if (scene.theme === "dark") await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ theme: "深色" })));
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() !== "GET") {
      const body = (() => {
        try {
          return request.postDataJSON() as Record<string, unknown>;
        } catch {
          return null;
        }
      })();
      calls.push({ method: request.method(), path: pathname, body });
      if (pathname.endsWith("/messages") && scene.slowMessages) await new Promise((resolve) => setTimeout(resolve, scene.slowMessages));
      return json({});
    }
    if (pathname === "/v1/tasks") return json({ items: [state.task] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json(state.task);
    if (pathname.endsWith("/plan")) return json(scene.plan ?? plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [] });
    if (pathname.endsWith("/config")) return json(scene.teamed ? teamConfig : { config_version: 1, expert: "writer@1", skills: null, connector_ids: null, mode: "default" });
    if (pathname === "/v1/experts") return json({ items: scene.teamed ? [expert, researcher, reviewer, team] : [expert] });
    if (pathname === "/v1/models") return json({ items: ["test-model", "glm-5-flash"], default: "test-model" });
    return json({ items: [], total: 0 });
  });
  return { state, calls };
}

const open = async (page: Page) => {
  await page.goto(`/tasks/${TASK_ID}`);
  await expect(page.getByTestId("composer")).toBeAttached();
};
/** Push a durable event into the page the way the stream would. */
const push = (page: Page, item: ReturnType<typeof event>) => page.evaluate((payload) => (window as unknown as { __push: (item: unknown) => void }).__push(payload), item);
const field = (page: Page) => page.getByPlaceholder("向任务发送消息");
const posts = (calls: Call[], suffix: string) => calls.filter((call) => call.path.endsWith(suffix));

async function renderedFontSizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const sizes = new Set<number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (parent && text.textContent?.trim() && parent.getClientRects().length > 0 && !["SCRIPT", "STYLE"].includes(parent.tagName)) sizes.add(Number.parseFloat(getComputedStyle(parent).fontSize));
    }
    for (const input of document.querySelectorAll("input:not([type=checkbox]):not([type=file]), textarea, select")) if (input.getClientRects().length > 0) sizes.add(Number.parseFloat(getComputedStyle(input).fontSize));
    return [...sizes].sort((a, b) => a - b);
  });
}
const sideways = (page: Page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));

async function noSidewaysScroll(page: Page, name: string) {
  const { scroll, body, inner } = await sideways(page);
  expect(scroll, `${name}: documentElement scrolls sideways`).toBeLessThanOrEqual(inner);
  expect(body, `${name}: body scrolls sideways`).toBeLessThanOrEqual(inner);
}

const channels = (color: string) => (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);

// ---- behaviour (desktop, light) ---------------------------------------------------------------------------------------------

test.describe("question dock", () => {
  test("options, 自定义回答, 跳过, 下一项 → 提交, ‹ ›, number keys, minimize → pill → re-dock, draft kept", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await open(page);
    // A draft typed before the question arrives must survive.
    await field(page).fill("先写好的草稿");
    await push(page, askEvent());

    const card = page.getByTestId("question-card");
    await expect(card).toBeVisible();
    // C1: docked in the composer's slot, same column width, composer hidden + inert but mounted.
    const composer = page.getByTestId("composer");
    await expect(composer).toBeHidden();
    await expect(composer).toHaveAttribute("inert", "");
    const dock = await page.getByTestId("prompt-dock").boundingBox();
    const column = await page.getByTestId("conversation-column").boundingBox();
    expect(dock!.y, "the dock sits below the conversation").toBeGreaterThanOrEqual(column!.y);
    await expect(card.getByText("交互", { exact: true })).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox!.width, "same column as the conversation").toBeLessThanOrEqual(column!.width + 1);

    // Question 1: body semibold, numbered rows ~32px, a 18px circled index, the description muted below its label.
    await expect(page.getByTestId("agent-question-text")).toHaveText("公司名称用哪一个？");
    expect(await page.getByTestId("agent-question-text").evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");
    const rows = card.getByRole("radio");
    await expect(rows).toHaveCount(3);
    const second = await rows.nth(1).boundingBox();
    expect(second!.height, "an option row without a description is about 32px").toBeGreaterThanOrEqual(32);
    expect(second!.height).toBeLessThanOrEqual(36);
    const first = await rows.nth(0).boundingBox();
    expect(first!.height, "the description sits below the label").toBeGreaterThan(second!.height);
    const index = rows.nth(0).locator("span").first();
    expect(await index.evaluate((el) => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`)).toBe("18x18");
    await expect(card.getByLabel("自定义回答")).toBeVisible();
    await expect(page.getByTestId("question-counter")).toHaveText("1/3");
    const primary = page.getByTestId("question-primary");
    await expect(primary).toHaveText("下一项");
    // Nothing answered and nothing else open to move to except the other questions: 下一项 moves on.
    // Number key picks option 1 of a single-select question and jumps to the next unanswered one.
    await page.keyboard.press("1");
    await expect(page.getByTestId("question-counter")).toHaveText("2/3");
    await expect(page.getByTestId("agent-question-text")).toHaveText("需要哪些页面？");

    // Question 2 is multi-select: picks stay on the question.
    await card.getByRole("checkbox", { name: "首页" }).click();
    await card.getByRole("checkbox", { name: "联系页" }).click();
    await expect(page.getByTestId("question-counter")).toHaveText("2/3");
    await expect(card.getByRole("checkbox", { name: "首页" })).toHaveAttribute("aria-checked", "true");
    // Minimize: the card goes, a pill takes its place, the composer is back with its draft.
    await page.getByTestId("question-minimize").click();
    await expect(card).toBeHidden();
    const pill = page.getByTestId("question-pill");
    await expect(pill).toHaveText(/回答 3 个问题/);
    await expect(composer).toBeVisible();
    await expect(field(page)).toHaveValue("先写好的草稿");
    const pillBox = await pill.boundingBox();
    const composerBox = await field(page).boundingBox();
    expect(pillBox!.y + pillBox!.height, "the pill sits above the composer").toBeLessThanOrEqual(composerBox!.y);
    // Re-dock: the answers given so far are still there.
    await pill.click();
    await expect(card).toBeVisible();
    await expect(composer).toBeHidden();
    await expect(page.getByTestId("question-counter")).toHaveText("2/3");
    await expect(card.getByRole("checkbox", { name: "联系页" })).toHaveAttribute("aria-checked", "true");

    // 下一项 jumps to the next question still waiting; 跳过 resolves question 3; with everything resolved the button reads 提交.
    await expect(primary).toHaveText("下一项");
    await primary.click();
    await expect(page.getByTestId("question-counter")).toHaveText("3/3");
    await expect(primary, "the only open question: nothing to move to until it is answered or skipped").toBeDisabled();
    await page.getByRole("button", { name: "跳过" }).click();
    await expect(primary).toHaveText("提交");
    await expect(primary).toBeEnabled();
    // ‹ › move between questions, wrapping.
    await card.getByRole("button", { name: "上一题" }).click();
    await expect(page.getByTestId("question-counter")).toHaveText("2/3");
    await card.getByRole("button", { name: "下一题" }).click();
    await card.getByRole("button", { name: "下一题" }).click();
    await expect(page.getByTestId("question-counter")).toHaveText("1/3");
    await primary.click();

    await expect.poll(() => posts(calls, "/messages").length).toBe(1);
    expect(posts(calls, "/messages")[0]?.body).toMatchObject({ delivery: "queue", text: "1. 公司：迈能\n2. 页面：首页、联系页\n3. 风格：未回答" });
  });

  test("自定义回答: typing counts as the answer, Enter moves on and, at the end, submits", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await open(page);
    await push(page, askEvent());
    const card = page.getByTestId("question-card");
    const custom = card.getByLabel("自定义回答");
    await custom.fill("迈能（集团）");
    await custom.press("Enter");
    await expect(page.getByTestId("question-counter")).toHaveText("2/3");
    await card.getByRole("checkbox", { name: "关于我们" }).click();
    await page.getByTestId("question-primary").click();
    await expect(page.getByTestId("question-counter")).toHaveText("3/3");
    await card.getByLabel("自定义回答").fill("沉稳");
    await expect(page.getByTestId("question-primary")).toHaveText("提交");
    await card.getByLabel("自定义回答").press("Enter");
    await expect.poll(() => posts(calls, "/messages").length).toBe(1);
    expect(posts(calls, "/messages")[0]?.body?.text).toBe("1. 公司：迈能（集团）\n2. 页面：关于我们\n3. 风格：沉稳");
  });

  test("a question without options shows its text and a reply field with 回复", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await open(page);
    await push(page, askEvent(false));
    const card = page.getByTestId("question-card");
    await expect(page.getByTestId("agent-question")).toContainText("公司名称");
    await expect(card.getByRole("radio")).toHaveCount(0);
    await card.getByLabel("回复 Agent").fill("用迈能");
    await card.getByRole("button", { name: "回复" }).click();
    await expect.poll(() => posts(calls, "/messages").length).toBe(1);
    expect(posts(calls, "/messages")[0]?.body).toMatchObject({ text: "用迈能", delivery: "queue" });
  });
});

test.describe("approval dock", () => {
  test("queue (approvals in order, then the question), keys 1 / 2, a refusal with a reason", async ({ page }) => {
    const { state, calls } = await mockBackend(page, { task: { pending_approvals: ["apr_1", "apr_2"] }, events: [...baseEvents(), bashApproval("apr_1", "printf '风险排序\\n' > risks.md\n".repeat(30)), nodeApproval("apr_2")] });
    await open(page);
    await push(page, askEvent());

    // One card at a time with 「‹ 1 / 3 ›」.
    const card = page.getByTestId("approval-item");
    await expect(card).toHaveCount(1);
    await expect(page.getByTestId("dock-queue")).toContainText("1 / 3");
    await expect(page.getByTestId("approval-title")).toHaveText("运行命令");
    await expect(page.getByTestId("composer")).toBeHidden();
    // The command sits in a mono box that scrolls (max-h-36 = 144px).
    const detail = page.getByTestId("approval-detail");
    expect(await detail.evaluate((el) => ({ max: getComputedStyle(el).maxHeight, font: getComputedStyle(el).fontFamily, scrolls: el.scrollHeight > el.clientHeight }))).toMatchObject({ max: "144px", scrolls: true });
    expect((await detail.evaluate((el) => getComputedStyle(el).fontFamily)).toLowerCase()).toContain("mono");
    // Numbered choices, the second says what "always" frees.
    await expect(page.getByTestId("approval-approve")).toHaveText("1允许");
    await expect(page.getByTestId("approval-always")).toContainText("本任务内总是允许");
    await expect(page.getByTestId("approval-always")).toContainText("以 printf 开头的命令不再询问");
    // The reject row: pencil, an input, a dark pill 否 ↵.
    await expect(page.getByLabel("拒绝并说明如何调整")).toHaveAttribute("placeholder", "否，请告诉我如何调整");
    await expect(page.getByTestId("approval-reject")).toHaveText("否↵");

    // ‹ › walk the queue: the second is the plan's approval (no "always"), the third the question.
    await page.getByRole("button", { name: "下一件待处理" }).click();
    await expect(page.getByTestId("dock-queue")).toContainText("2 / 3");
    await expect(card).toHaveAttribute("data-kind", "node_approval");
    await expect(page.getByTestId("approval-title")).toHaveText("把摘要发给全部评审人？");
    await expect(page.getByTestId("approval-always")).toHaveCount(0);
    await expect(page.getByTestId("approval-approve")).toHaveText("1批准");
    await page.getByRole("button", { name: "下一件待处理" }).click();
    await expect(page.getByTestId("dock-queue")).toContainText("3 / 3");
    await expect(page.getByTestId("question-card")).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "下一件待处理" }).click();
    await expect(page.getByTestId("dock-queue")).toContainText("1 / 3");

    // Key 2 on the first: allow, and always allow.
    await page.keyboard.press("2");
    await expect.poll(() => posts(calls, "/approvals/apr_1").length).toBe(1);
    expect(posts(calls, "/approvals/apr_1")[0]?.body).toMatchObject({ decision: "approve", always: true });
    state.task.pending_approvals = ["apr_2"];
    await push(page, decided("apr_1", "APPROVED"));
    await expect(page.getByTestId("dock-queue")).toContainText("1 / 2");
    await expect(card).toHaveAttribute("data-kind", "node_approval");

    // Typing in the reason field does not trigger the number keys; Enter refuses with the reason.
    const reason = page.getByLabel("拒绝并说明如何调整");
    await reason.fill("先 1 再 2，范围缩小到三个人");
    await expect(page.getByTestId("approval-approve")).toBeVisible();
    expect(posts(calls, "/approvals/apr_2")).toHaveLength(0);
    // The reason survives walking the queue and coming back.
    await page.getByRole("button", { name: "下一件待处理" }).click();
    await page.getByRole("button", { name: "上一件待处理" }).click();
    await expect(reason).toHaveValue("先 1 再 2，范围缩小到三个人");
    await reason.press("Enter");
    await expect.poll(() => posts(calls, "/messages").length).toBe(1);
    // What goes out: the refusal with the reason as its comment, then the reason as a queued message (the runtime does not hand a comment to the agent).
    const sent = calls.filter((call) => call.path.endsWith("/approvals/apr_2") || call.path.endsWith("/messages"));
    expect(sent.map((call) => call.path)).toEqual([`/v1/tasks/${TASK_ID}/approvals/apr_2`, `/v1/tasks/${TASK_ID}/messages`]);
    expect(sent[0]?.body).toEqual({ decision: "reject", always: false, comment: "先 1 再 2，范围缩小到三个人" });
    expect(sent[1]?.body).toEqual({ text: "先 1 再 2，范围缩小到三个人", delivery: "queue" });
  });

  test("a refusal without a reason sends no message; the button 否 refuses too", async ({ page }) => {
    const { calls } = await mockBackend(page, { task: { pending_approvals: ["apr_1"] }, events: [...baseEvents(), bashApproval()] });
    await open(page);
    await page.getByTestId("approval-reject").click();
    await expect.poll(() => posts(calls, "/approvals/apr_1").length).toBe(1);
    expect(posts(calls, "/approvals/apr_1")[0]?.body).toEqual({ decision: "reject", always: false });
    expect(posts(calls, "/messages")).toHaveLength(0);
  });
});

test.describe("markers where it was asked", () => {
  test("single agent: pending → click brings the card back → 已允许 / 已拒绝 / 已取消", async ({ page }) => {
    const { state } = await mockBackend(page, { task: { pending_approvals: ["apr_1", "apr_2", "apr_3"] }, events: [...baseEvents(), bashApproval("apr_1"), bashApproval("apr_2", "ls -la"), bashApproval("apr_3", "cat risks.md")] });
    await open(page);
    const markers = page.getByTestId("approval-marker");
    await expect(markers).toHaveCount(3);
    await expect(markers.nth(0)).toHaveAttribute("data-state", "pending");
    await expect(markers.nth(0)).toContainText("等待你确认：运行命令");
    // The full card is not in the conversation: it is docked, and the markers are one line.
    await expect(page.getByTestId("conversation-column").getByTestId("approval-item")).toHaveCount(0);
    const line = await markers.nth(0).boundingBox();
    expect(line!.height).toBeLessThan(44);
    // Clicking the second marker docks that card and focuses it.
    await markers.nth(1).click();
    await expect(page.getByTestId("approval-item")).toHaveAttribute("data-approval-id", "apr_2");
    await expect(page.getByTestId("approval-item")).toBeFocused();
    await expect(page.getByTestId("dock-queue")).toContainText("2 / 3");

    state.task.pending_approvals = [];
    await push(page, decided("apr_1", "APPROVED"));
    await push(page, decided("apr_2", "REJECTED"));
    await push(page, decided("apr_3", "CANCELLED"));
    await expect(markers.nth(0)).toHaveAttribute("data-state", "approved");
    await expect(markers.nth(0)).toContainText("已允许：运行命令");
    await expect(markers.nth(1)).toHaveAttribute("data-state", "rejected");
    await expect(markers.nth(1)).toContainText("已拒绝：运行命令");
    await expect(markers.nth(2)).toHaveAttribute("data-state", "cancelled");
    await expect(markers.nth(2)).toContainText("已取消：运行命令");
    // Nothing waits any more: the dock is gone and the composer is back.
    await expect(page.getByTestId("approval-item")).toHaveCount(0);
    await expect(page.getByTestId("composer")).toBeVisible();
  });

  test("team: the marker sits in the group chat with the member's name, the card docks with the member's header", async ({ page }) => {
    const teamEvents = [
      ...baseEvents(),
      event("approval.requested", { approval_id: "apr_1", node_id: "n_2", attempt_id: "att_1", subject: { kind: "tool_call", summary: "member-3: Bash", detail: "cat rollback.md", role: "member-3", role_label: "评审员", allow_rule: { tool_name: "Bash", rule_content: "cat:*" } } }),
    ];
    await mockBackend(page, { teamed: true, task: { pending_approvals: ["apr_1"] }, events: teamEvents });
    await open(page);
    const marker = page.getByTestId("approval-marker");
    await expect(marker).toHaveCount(1);
    await expect(marker).toContainText("评审员");
    await expect(marker).toContainText("等待你确认");
    const card = page.getByTestId("approval-item");
    await expect(card).toHaveAttribute("data-role", "member-3");
    await expect(card.getByTestId("approval-member")).toHaveText("成员 评审员 请求确认");
    await expect(page.getByTestId("conversation-column").getByTestId("approval-item")).toHaveCount(0);
  });
});

test.describe("send button", () => {
  test("disabled → ready → sending → back; the field grows to about 220px", async ({ page }) => {
    const { calls } = await mockBackend(page, { task: { status: "COMPLETED" }, slowMessages: 700 });
    await open(page);
    const button = page.getByTestId("composer-action");
    expect(await button.evaluate((el) => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`)).toBe("36x36");
    await expect(button).toHaveAttribute("data-state", "send");
    await expect(button).toBeDisabled();
    const gray = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    await field(page).fill("你好");
    await expect(button).toBeEnabled();
    await expect.poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor), "ready is the primary fill, disabled is gray").not.toBe(gray);
    // The field grows with its content and stops at about 220px.
    const before = (await field(page).boundingBox())!.height;
    await field(page).fill(Array.from({ length: 5 }, (_, i) => `第 ${i + 1} 行`).join("\n"));
    const grown = (await field(page).boundingBox())!.height;
    expect(grown).toBeGreaterThan(before);
    await field(page).fill(Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行`).join("\n"));
    const capped = (await field(page).boundingBox())!.height;
    expect(capped).toBeGreaterThanOrEqual(216);
    expect(capped).toBeLessThanOrEqual(224);
    await field(page).fill("你好");
    await button.click();
    await expect(button).toHaveAttribute("data-state", "sending");
    await expect(button.locator("svg.animate-spin")).toBeVisible();
    await expect(field(page)).toHaveValue("你好");
    await expect(button).toHaveAttribute("data-state", "send");
    await expect(field(page)).toHaveValue("");
    expect(posts(calls, "/messages")).toHaveLength(1);
  });

  test("while the task runs: stop (a filled square) → typing turns it into send → empty again, stop; paused: continue", async ({ page }) => {
    const { calls, state } = await mockBackend(page, { task: { status: "RUNNING" } });
    await open(page);
    const button = page.getByTestId("composer-action");
    await expect(button).toHaveAttribute("data-state", "stop");
    await expect(button).toBeEnabled();
    expect(await button.locator("svg").evaluate((el) => getComputedStyle(el).fill)).not.toBe("none");
    // Stop is the strong neutral (the text colour), not the primary fill that send uses.
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await page.evaluate(() => getComputedStyle(document.body).color));
    await field(page).fill("顺便补一句");
    await expect(button).toHaveAttribute("data-state", "send");
    await field(page).fill("");
    await expect(button).toHaveAttribute("data-state", "stop");
    await button.click();
    await expect.poll(() => posts(calls, "/control").length).toBe(1);
    expect(posts(calls, "/control")[0]?.body).toEqual({ action: "stop" });
    // Typing while it runs queues the message, as before; ⌘/Ctrl+Enter interrupts.
    await field(page).fill("排队的消息");
    await field(page).press("Enter");
    await expect.poll(() => posts(calls, "/messages").length).toBe(1);
    expect(posts(calls, "/messages")[0]?.body).toMatchObject({ text: "排队的消息", delivery: "queue" });
    // (the button shows the spinner until the message is accepted, then it is stop again with an empty field)
    await expect(button).toHaveAttribute("data-state", "stop");
    await field(page).fill("马上改做这个");
    await field(page).press("Control+Enter");
    await expect.poll(() => posts(calls, "/messages").length).toBe(2);
    expect(posts(calls, "/messages")[1]?.body).toMatchObject({ text: "马上改做这个", delivery: "interrupt" });
    // Paused: the same button continues.
    state.task.status = "PAUSED";
    await push(page, event("task.status_changed", { from_status: "RUNNING", to_status: "PAUSED" }));
    await expect(button).toHaveAttribute("data-state", "continue");
    await button.click();
    await expect.poll(() => posts(calls, "/control").length).toBe(2);
    expect(posts(calls, "/control")[1]?.body).toEqual({ action: "resume" });
  });
});

test.describe("slash commands", () => {
  test("opens on / in an empty field, filters, wraps with the arrows, selects with Enter, closes on Esc and Backspace", async ({ page }) => {
    const { calls } = await mockBackend(page, { task: { status: "RUNNING" } });
    await open(page);
    await expect(page.getByTestId("config-add")).toBeEnabled();
    await field(page).click();
    await field(page).pressSequentially("/");
    const menu = page.getByTestId("slash-menu");
    await expect(menu).toBeVisible();
    // Anchored on top of the composer and as wide as it; rows are about 32px with an icon, a label and a muted hint.
    // (layout sizes, not the box mid-way through its pop-in animation)
    const surface = await menu.locator("xpath=..").evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, top: el.getBoundingClientRect().top }));
    const box = await menu.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, bottom: el.getBoundingClientRect().bottom }));
    expect(box.width, "as wide as the composer").toBe(surface.width);
    expect(box.bottom, "above the composer").toBeLessThanOrEqual(surface.top);
    const items = page.getByTestId("slash-item");
    await expect(items.locator("button .shrink-0.font-medium")).toHaveText(["模式", "专家", "技能", "连接器", "模型", "添加文件", "停止"]);
    expect(await items.first().locator("button").evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(32);
    await expect(items.first()).toHaveAttribute("aria-selected", "true");
    // ↑ wraps to the last, ↓ wraps back.
    await field(page).press("ArrowUp");
    await expect(items.last()).toHaveAttribute("aria-selected", "true");
    await field(page).press("ArrowDown");
    await expect(items.first()).toHaveAttribute("aria-selected", "true");
    // Filter by what follows the "/".
    await field(page).pressSequentially("模");
    await expect(items).toHaveCount(2);
    await expect(items.locator("button .shrink-0.font-medium")).toHaveText(["模式", "模型"]);
    await field(page).press("ArrowDown");
    // Enter selects: the draft is cleared and the model picker opens.
    await field(page).press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
    await expect(page.getByLabel("模型", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    // Esc closes the list and keeps what was typed.
    await field(page).fill("");
    await field(page).pressSequentially("/");
    await expect(menu).toBeVisible();
    await field(page).press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(field(page)).toHaveValue("/");
    // Backspace on the empty query takes the "/" and the list with it.
    await field(page).fill("");
    await field(page).pressSequentially("/");
    await expect(menu).toBeVisible();
    await field(page).press("Backspace");
    await expect(menu).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
    // Not in the middle of a message: "/" after text is just a character.
    await field(page).pressSequentially("看 a/b");
    await expect(menu).toHaveCount(0);
    await field(page).fill("");

    // Commands the composer already has: 模式 opens the + menu on its mode panel, 添加文件 opens the file chooser, 停止 stops the run.
    await field(page).pressSequentially("/模式");
    await field(page).press("Enter");
    await expect(page.getByRole("menu", { name: "添加" })).toBeVisible();
    await expect(page.getByLabel("模式", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await field(page).pressSequentially("/文件");
    const chooser = page.waitForEvent("filechooser");
    await field(page).press("Enter");
    await chooser;
    await field(page).pressSequentially("/停止");
    await field(page).press("Enter");
    await expect.poll(() => posts(calls, "/control").length).toBe(1);
    expect(posts(calls, "/control")[0]?.body).toEqual({ action: "stop" });
    // Nothing the composer cannot do: no command for pause, and no 继续 while it runs.
    await field(page).pressSequentially("/");
    await expect(items.filter({ hasText: "继续" })).toHaveCount(0);
    await expect(items.filter({ hasText: "暂停" })).toHaveCount(0);
  });

  test("input method: a / typed while composing does not open it, and an Enter that belongs to the IME selects nothing", async ({ page }) => {
    await mockBackend(page);
    await open(page);
    const menu = page.getByTestId("slash-menu");
    // "/" arriving as part of a composition.
    await field(page).evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "/");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "/", isComposing: true }));
    });
    await expect(field(page)).toHaveValue("/");
    await expect(menu).toHaveCount(0);
    await field(page).evaluate((el: HTMLTextAreaElement) => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "/" })));
    // Typed for real, the list opens; an Enter with keyCode 229 and one right after compositionend do nothing.
    await field(page).fill("");
    await field(page).pressSequentially("/");
    await expect(menu).toBeVisible();
    await field(page).evaluate((el: HTMLTextAreaElement) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true })));
    await expect(menu).toBeVisible();
    await field(page).evaluate((el: HTMLTextAreaElement) => {
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await expect(menu).toBeVisible();
    await expect(field(page)).toHaveValue("/");
    // A plain Enter later selects.
    await page.waitForTimeout(200);
    await field(page).press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
  });
});

test.describe("plan pill", () => {
  test("counts steps, opens a popover with the items, hides while a card is docked, fades out when the work is done", async ({ page }) => {
    const { state } = await mockBackend(page, { task: { status: "RUNNING" }, events: [...baseEvents(), todoCall(["completed", "in_progress", "pending"])] });
    await open(page);
    const pill = page.getByTestId("todo-checklist");
    await expect(pill).toHaveText("已完成 1/3 步");
    const box = await pill.boundingBox();
    expect(box!.height).toBe(40);
    expect(await pill.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("9999px");
    expect(await pill.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    const ring = page.getByTestId("plan-ring");
    expect(await ring.evaluate((el) => `${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`)).toBe("14x14");
    expect(await ring.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("conic-gradient");
    await expect(ring).not.toHaveAttribute("data-failed", "true");
    // Centred in the column, above the composer.
    const column = await page.getByTestId("conversation-column").boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - (column!.x + column!.width / 2))).toBeLessThanOrEqual(2);
    expect(box!.y + box!.height).toBeLessThanOrEqual((await field(page).boundingBox())!.y);
    // The popover lists the items with their states above the pill.
    await pill.click();
    const items = page.getByTestId("todo-item");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveAttribute("data-status", "completed");
    await expect(items.nth(1)).toHaveAttribute("data-status", "in_progress");
    await expect(items.nth(2)).toHaveAttribute("data-status", "pending");
    await expect(items.nth(1).locator("svg.animate-spin")).toBeVisible();
    const popover = await page.getByTestId("todo-popover").boundingBox();
    expect(popover!.y + popover!.height).toBeLessThanOrEqual(box!.y);
    await page.getByTestId("conversation-column").click({ position: { x: 4, y: 4 } });
    await expect(items).toHaveCount(0);

    // A card docked in the composer's slot: the pill steps aside, then returns.
    state.task.pending_approvals = ["apr_1"];
    await push(page, bashApproval());
    await expect(page.getByTestId("approval-item")).toBeVisible();
    await expect(pill).toHaveCount(0);
    state.task.pending_approvals = [];
    await push(page, decided("apr_1", "APPROVED"));
    await expect(pill).toBeVisible();

    // Everything done and the task idle: the pill reads 3/3, lingers, then fades out and goes.
    state.task.status = "COMPLETED";
    await push(page, todoCall(["completed", "completed", "completed"]));
    await expect(pill).toHaveText("已完成 3/3 步");
    await expect(pill).toHaveAttribute("data-phase", "shown");
    await expect(pill).toHaveCount(0, { timeout: 4000 });
  });

  test("a failed item tints the ring, and a team's items carry their owner", async ({ page }) => {
    const teamPlan = {
      ...plan,
      nodes: [
        node("n_1", "Explore and plan", "COMPLETED", { frozen: true }),
        node("n_a", "调研发布风险", "COMPLETED", { depends_on: ["n_1"], owner_profile: "research@1", parent_node_id: "n_1", owner_role: "member-2", owner_label: "研究员" }),
        node("n_b", "评审发布方案", "FAILED", { depends_on: ["n_a"], owner_profile: "reviewer@1", parent_node_id: "n_1", owner_role: "member-3", owner_label: "评审员" }),
      ],
    };
    await mockBackend(page, { teamed: true, task: { status: "RUNNING" }, plan: teamPlan, events: baseEvents() });
    await open(page);
    const pill = page.getByTestId("todo-checklist");
    await expect(pill).toContainText("步");
    await expect(page.getByTestId("plan-ring")).toHaveAttribute("data-failed", "true");
    await pill.click();
    await expect(page.getByTestId("todo-item").filter({ has: page.locator('[aria-label="失败"]') })).toHaveCount(1);
    await expect(page.getByTestId("todo-owner").first()).toBeVisible();
  });
});

// ---- the surfaces in both themes and widths, with screenshots ------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`surfaces @ ${theme} ${viewport.name}`, () => {
      const phone = viewport.width < 640;
      test.use({ viewport: { width: viewport.width, height: viewport.height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });

      async function snap(page: Page, scene: string) {
        await page.waitForTimeout(200);
        await noSidewaysScroll(page, scene);
        const sizes = await renderedFontSizes(page);
        expect(sizes.filter((size) => !FONT_SIZES.has(size)), `${scene}: font sizes outside the scale`).toEqual([]);
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: join(OUT, `${theme}-${viewport.name}-${scene}.png`) });
      }
      const surface = async (page: Page, scene: Scene) => {
        const backend = await mockBackend(page, { ...scene, theme: theme === "dark" ? "dark" : undefined });
        await open(page);
        if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        return backend;
      };
      /** The docked card is the loud surface in either theme: a tinted surface that is dark in the dark theme. */
      const expectLoud = async (card: Locator) => {
        await expect(card.getByTestId("attention-bar")).toBeVisible();
        const look = await card.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderTopWidth }));
        expect(look.shadow).not.toBe("none");
        expect(look.border).toBe("1px");
        if (theme === "dark") expect(Math.max(...channels(look.bg).slice(0, 3)), `card surface ${look.bg}`).toBeLessThan(80);
      };

      test("question dock", async ({ page }) => {
        await surface(page, { events: [...baseEvents(), askEvent()] });
        const card = page.getByTestId("question-card");
        await expect(card).toBeVisible();
        await expectLoud(card);
        const box = await card.boundingBox();
        expect(box!.y + box!.height, "the card is inside the viewport").toBeLessThanOrEqual(viewport.height);
        expect(box!.width).toBeLessThanOrEqual(viewport.width);
        await expect(page.getByTestId("composer")).toBeHidden();
        await snap(page, "question-dock");
        await page.getByTestId("question-minimize").click();
        await expect(page.getByTestId("question-pill")).toBeVisible();
        await snap(page, "question-pill");
      });

      test("approval dock", async ({ page }) => {
        await surface(page, { task: { pending_approvals: ["apr_1", "apr_2"] }, events: [...baseEvents(), bashApproval("apr_1", "printf '风险排序\\n' > risks.md\ncat risks.md\n".repeat(12)), nodeApproval("apr_2")] });
        const card = page.getByTestId("approval-item");
        await expect(card).toBeVisible();
        await expectLoud(card);
        // On a phone the dock may be taller than 45vh: it scrolls inside itself and the reject row stays reachable.
        const dock = await page.getByTestId("prompt-dock").boundingBox();
        expect(dock!.height, "the dock is at most about 45vh").toBeLessThanOrEqual(viewport.height * 0.45 + 40);
        await page.getByTestId("approval-reject").scrollIntoViewIfNeeded();
        await expect(page.getByTestId("approval-reject")).toBeInViewport();
        await expect(page.getByTestId("approval-marker").first()).toBeVisible();
        await snap(page, "approval-dock");
      });

      test("plan pill and its popover", async ({ page }) => {
        await surface(page, { task: { status: "RUNNING" }, events: [...baseEvents(), todoCall(["completed", "in_progress", "pending"])] });
        const pill = page.getByTestId("todo-checklist");
        await expect(pill).toBeVisible();
        await snap(page, "plan-pill");
        await pill.click();
        await expect(page.getByTestId("todo-popover")).toBeVisible();
        await snap(page, "plan-popover");
      });

      test("slash menu", async ({ page }) => {
        await surface(page, { task: { status: "RUNNING" } });
        await field(page).click();
        await field(page).pressSequentially("/");
        await expect(page.getByTestId("slash-menu")).toBeVisible();
        const menu = await page.getByTestId("slash-menu").boundingBox();
        expect(menu!.x).toBeGreaterThanOrEqual(0);
        expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width);
        await snap(page, "slash-menu");
      });

      test("composer toolbar: one line, the send button whole", async ({ page }) => {
        await surface(page, { teamed: true, task: { status: "COMPLETED" } });
        await field(page).fill("你好");
        const button = page.getByTestId("composer-action");
        await expect(button).toBeVisible();
        const send = (await button.boundingBox())!;
        expect(send.x).toBeGreaterThanOrEqual(0);
        expect(send.x + send.width, "the send button is not clipped").toBeLessThanOrEqual(viewport.width);
        expect(send.width).toBe(36);
        // Everything in the toolbar sits on one line.
        const row = button.locator("xpath=..");
        const tops = await row.locator("> *").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)));
        expect(new Set(tops.filter((_, i) => i !== 1)).size, `toolbar centres ${tops}`).toBe(1);
        const permission = (await page.getByTestId("permission-chip").boundingBox())!;
        const model = (await page.getByTestId("model-selector").boundingBox())!;
        if (phone) {
          // Collapsed to icons under about 520px of composer width; the team chip truncates instead of pushing them out.
          expect(permission.width).toBeLessThanOrEqual(40);
          expect(model.width).toBeLessThanOrEqual(40);
          const chip = (await page.getByTestId("config-chip").first().boundingBox())!;
          expect(chip.x + chip.width, "the chip stops before the permission trigger").toBeLessThanOrEqual(permission.x + 1);
          expect(chip.height).toBeLessThanOrEqual(28);
          await expect(page.getByTestId("model-selector")).toContainText("默认模型");
        } else {
          expect(permission.width).toBeGreaterThan(60);
          expect(model.width).toBeGreaterThan(60);
        }
        await snap(page, "composer-toolbar");
        // The model list opens inside the viewport from its (right-aligned, on a phone) trigger.
        await page.getByTestId("model-selector").click();
        const panel = (await page.getByLabel("模型", { exact: true }).boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
        await noSidewaysScroll(page, "model list open");
      });
    });
  }
}
