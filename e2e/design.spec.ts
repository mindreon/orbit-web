/**
 * Design pass: the pages at desktop (1440x900) and phone (390x844) width, with a route-mocked API.
 * Screenshots go to e2e-artifacts/design/<width>x<height>/<page>.png (git-ignored); the measured font sizes of every
 * page go to e2e-artifacts/design/font-sizes.json.
 *
 * Ways this can fail (each is asserted below):
 *   P1 a page scrolls sideways (documentElement.scrollWidth > innerWidth) at either width
 *   P2 the conversation column is narrower than 300px on a phone, or wider than ~40 CJK characters on desktop
 *   P3 a font size outside 12/13/14/16/20/24px is rendered
 *   P4 internal wording reaches the screen: id@version, "plan vN", node type "Agent 回合", "已冻结", raw frontmatter,
 *      English catalogue names, "v1" next to an expert in a list, four rows of "0 / 不限"
 *   P5 a "needs you" card has no accent bar, or the approval is not the loudest element of the conversation
 *   P6 under 1024px the details are not a drawer opened from the header; under 640px the sidebar is not a drawer
 *   P7 a sidebar group label is not at least twice as close to its own group as to the previous one; "即将" entries look like real ones
 *   P8 a coming-soon page offers a disabled primary action or developer copy
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";

const OUT = "e2e-artifacts/design";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const NOW = "2026-10-05T08:00:00Z";
const FONT_SIZES = new Set([12, 13, 14, 16, 20, 24]);
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

const task = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理本周发布风险",
  goal: "把本周的发布风险整理成一页摘要，并标出需要我决定的事项。",
  mode: "single",
  status: "WAITING",
  profile: "writer@1",
  plan_version: 3,
  created_by: "user-a",
  created_at: NOW,
  updated_at: NOW,
  budgets: {},
  usage: {},
  pending_approvals: ["apr_1"],
};

const node = (id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
  node_id: id,
  type: "agent_turn",
  title,
  status,
  depends_on: [],
  workspace_access: "write",
  owner_profile: "default@1",
  frozen: false,
  attempt_count: 1,
  ...extra,
});
const plan = {
  plan_version: 3,
  hash: `sha256:${"a".repeat(64)}`,
  nodes: [node("n_1", "Explore and plan", "COMPLETED", { frozen: true }), node("n_2", "Draft report", "RUNNING", { depends_on: ["n_1"], owner_profile: "writer@1" }), node("n_3", "Review report", "PENDING", { depends_on: ["n_2"] })],
  edges: [],
};

const event = (seq: number, type: string, payload: Record<string, unknown>) => ({ seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: NOW });
const SUMMARY = "本周共有三项发布风险：数据库迁移窗口与大促重叠、支付网关证书将在周四到期、新版客户端的灰度比例还没有定。建议先处理证书，其次确认迁移窗口，最后再扩大灰度。以上结论来自发布计划、值班记录和监控看板，细节见下面的摘要文件。";
const events = [
  event(1, "task.created", { goal: task.goal, title: task.title }),
  event(2, "attempt.started", { attempt_id: "att_1", node_id: "n_1", attempt_no: 1, profile: "default@1" }),
  event(3, "tool.call_started", { attempt_id: "att_1", tool_call_id: "tc_1", tool_name: "read_file", args_preview: "release-plan.md" }),
  event(4, "tool.call_finished", { attempt_id: "att_1", tool_call_id: "tc_1", tool_name: "read_file", state: "success", result_preview: "ok" }),
  event(5, "message.agent_final", { attempt_id: "att_1", text: SUMMARY }),
  event(6, "attempt.finished", { attempt_id: "att_1", node_id: "n_1", outcome: "completed" }),
  event(7, "message.user", { text: "再把风险按严重程度排个序，并把需要我拍板的列出来。", delivery: "queue" }),
  event(8, "attempt.started", { attempt_id: "att_2", node_id: "n_2", attempt_no: 1, profile: "writer@1" }),
  event(9, "approval.requested", { approval_id: "apr_1", node_id: "n_2", subject: { kind: "tool_call", summary: "Bash", detail: "printf '风险排序\\n' > risks.md", allow_rule: { tool_name: "Bash", rule_content: "printf:*" } } }),
  event(10, "attempt.parked", { attempt_id: "att_2", node_id: "n_2", reason: "approval" }),
];

const expert = {
  expert_id: "writer",
  ref: "writer@1",
  version: 1,
  name: "文案专家",
  instructions: "---\nname: writer\ndescription: 写作助手\n---\n你是一名文案专家，擅长把复杂的信息写成一页能读完的摘要。",
  model: "",
  connector_ids: [],
  skill_ids: [],
  created_at: NOW,
};
const agent = (slug: string, extra: Record<string, unknown>) => ({
  id: `@AgentscopeAI/${slug}`,
  handle: "@AgentscopeAI",
  slug,
  name: slug,
  description: "",
  framework: "qwenpaw",
  license: "",
  logoUrl: "",
  catalogues: ["development-tools"],
  models: [],
  mcps: [],
  skills: [],
  systemPrompts: [],
  readme: "",
  files: [],
  stars: 3,
  downloads: 12,
  visits: 1,
  updatedAt: "0",
  source: "common",
  ...extra,
});
const AGENTS = [
  agent("财报分析师", { name: "财报分析师", description: "--- name: Analyst description: 把财报和指引里的冲突找出来，生成带决策记录的投委会材料 ---", framework: "qwenpaw", catalogues: ["finance", "development-tools"] }),
  agent("代码评审员", { name: "代码评审员", description: "逐个文件检查改动，指出风险并给出可执行的修改建议。", framework: "ms-agent", catalogues: ["development-tools", "mystery-category"] }),
  agent("神秘助手", { name: "神秘助手", description: "没有收录的框架标签不应该露出来。", framework: "weird-framework", catalogues: ["others"] }),
];

async function mockBackend(page: Page, scenario: { events?: typeof events; plan?: typeof plan; task?: Record<string, unknown> } = {}) {
  const feed = scenario.events ?? events;
  const shownPlan = scenario.plan ?? plan;
  const shownTask = { ...task, ...scenario.task };
  // A fake EventSource that delivers the task's events once and stays open, so no reconnect banner appears in screenshots.
  await page.addInitScript((items) => {
    class FakeEventSource {
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        setTimeout(() => {
          this.onopen?.({});
          for (const item of items) this.onmessage?.({ data: JSON.stringify(item) });
        }, 20);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, feed);
  await page.route("**/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (pathname === "/v1/tasks") return json({ items: [shownTask] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json(shownTask);
    if (pathname.endsWith("/plan")) return json(shownPlan);
    if (pathname.endsWith("/artifacts")) return json({ items: [{ manifest_id: "man_1", task_id: TASK_ID, attempt_id: "att_1", entries: [{ name: "风险摘要.md", media_type: "text/markdown", size_bytes: 2048, blob_ref: "sha256:x" }], created_at: NOW }] });
    if (pathname.endsWith("/config")) return json({ config_version: 1, expert: "writer@1", skills: null, connector_ids: null, mode: "default" });
    if (pathname === "/v1/experts") return json({ items: [expert] });
    if (pathname === "/v1/agents") return json({ items: AGENTS, total: AGENTS.length, page: 1, pageSize: 24 });
    if (pathname === "/v1/skills") return json({ items: [{ id: "@a/s", handle: "@a", slug: "s", name: "周报写作", description: "把零散记录整理成周报。", descriptionEn: "", category: "", categoryName: "", tags: [], license: "", iconUrl: "", sourceUrl: "", downloads: 12, visits: 1, likes: 3, updatedAt: "0", source: "common" }], total: 1, page: 1, pageSize: 24, installedAt: NOW });
    if (pathname === "/v1/mcp-market") return json({ items: [{ id: "m1", name: "文档检索", summary: "搜索团队文档。", author: "示例团队", category: "dev", categoryName: "开发", categoryMore: 0, calls: 0, views: 10, stars: 2, verified: true, hosted: true, needsOnline: true, source: "modelscope" }], total: 1, stored: 1, page: 1, pageSize: 30 });
    return json({ items: [], total: 0 });
  });
}

/** Every distinct rendered font size (px) of elements that show text, inputs included. */
async function renderedFontSizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const sizes = new Set<number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (parent && text.textContent?.trim() && parent.getClientRects().length > 0 && !["SCRIPT", "STYLE"].includes(parent.tagName)) sizes.add(Number.parseFloat(getComputedStyle(parent).fontSize));
    }
    for (const field of document.querySelectorAll("input:not([type=checkbox]):not([type=file]), textarea, select")) if (field.getClientRects().length > 0) sizes.add(Number.parseFloat(getComputedStyle(field).fontSize));
    return [...sizes].sort((a, b) => a - b);
  });
}

const overflow = (page: Page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));
const sizesSeen: Record<string, number[]> = {};

for (const viewport of VIEWPORTS) {
  test.describe(`design @ ${viewport.name}`, () => {
    const phone = viewport.width < 640;
    // A phone is a touch device: coarse pointer, so keyboard hints are hidden.
    test.use({ viewport: { width: viewport.width, height: viewport.height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });

    /** Settle, assert no sideways scroll and only the six font sizes, then save the screenshot. */
    async function check(page: Page, name: string) {
      await page.waitForTimeout(150);
      const { scroll, body, inner } = await overflow(page);
      expect(scroll, `${name}: documentElement scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner);
      expect(body, `${name}: body scrolls sideways (${body} > ${inner})`).toBeLessThanOrEqual(inner);
      const sizes = await renderedFontSizes(page);
      sizesSeen[`${viewport.name}/${name}`] = sizes;
      expect(sizes.filter((size) => !FONT_SIZES.has(size)), `${name}: font sizes outside the scale`).toEqual([]);
      const dir = join(OUT, viewport.name);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${name}.png`) });
    }

    test.beforeEach(async ({ page }) => {
      await mockBackend(page);
    });

    test.afterAll(() => {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `font-sizes-${viewport.name}.json`), JSON.stringify(sizesSeen, null, 2));
    });

    test("home", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("textbox", { name: "任务目标" })).toBeVisible();
      const hint = await page.locator("body").innerText();
      const placeholder = await page.getByRole("textbox", { name: "任务目标" }).getAttribute("placeholder");
      if (phone) expect(hint + (placeholder ?? "")).not.toMatch(/Shift\+Enter/);
      else expect(placeholder).toContain("Shift+Enter");
      await check(page, "home");
    });

    test("task page: conversation, plan and a waiting approval", async ({ page }) => {
      await page.goto(`/tasks/${TASK_ID}`);
      await expect(page.getByTestId("approval-item")).toBeVisible();
      await page.getByTestId("approval-item").scrollIntoViewIfNeeded();

      // P4: internal wording stays out of the page
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(/default@\d|writer@\d|plan v\d|Agent 回合|已冻结|Explore and plan|0 \/ 不限/);
      await expect(page.getByTestId("agent-message").first()).toContainText("文案专家");

      // P2: reading width
      const column = await page.getByTestId("conversation-column").boundingBox();
      if (phone) expect(column?.width ?? 0, "conversation column on a phone").toBeGreaterThanOrEqual(300);
      else {
        expect(column?.width ?? 0).toBeLessThanOrEqual(14 * 40 + 1);
        expect(column?.width ?? 0).toBeGreaterThanOrEqual(480);
        for (const testId of ["user-message", "approval-item"]) {
          const box = await page.getByTestId(testId).first().boundingBox();
          expect(box!.x + box!.width, `${testId} stays inside the column`).toBeLessThanOrEqual(column!.x + column!.width + 1);
        }
      }

      // P5: the approval is the loudest thing: accent bar, tinted surface, shadow; the plan cards are flat
      const approval = page.getByTestId("approval-item");
      await expect(approval.getByTestId("attention-bar")).toBeVisible();
      const loud = await approval.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, bg: getComputedStyle(el).backgroundColor }));
      expect(loud.shadow).not.toBe("none");
      expect(loud.bg).not.toBe("rgba(0, 0, 0, 0)");
      await expect(page.getByRole("button", { name: "允许一次" })).toBeVisible();

      // composer never overlaps what it follows
      const composer = await page.getByPlaceholder("向任务发送消息").boundingBox();
      const lastCard = await approval.boundingBox();
      expect(composer!.y).toBeGreaterThanOrEqual(0);
      expect(lastCard!.y + lastCard!.height, "approval card is above the composer when scrolled to").toBeLessThanOrEqual(composer!.y + 1);

      const header = page.locator("main header").first();
      await expect(header).not.toContainText("plan v");

      // Polish: one status per fact. The floating 「等待审批」 badge is gone while the card is shown,
      // badges are caption size (12px) at every width, and the composer's stop button yields to the card's primary action.
      await expect(page.getByTestId("agent-message").last().getByText("等待审批")).toHaveCount(0);
      expect(await page.getByTestId("task-status").evaluate((el) => getComputedStyle(el).fontSize)).toBe("12px");
      const title = await header.locator("h2").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(title).toBeGreaterThan(12);
      const stop = await page.getByTestId("composer-action").evaluate((el) => getComputedStyle(el).backgroundColor);
      const allow = await page.getByRole("button", { name: "允许一次" }).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(stop, "composer action is not the primary blue while a card waits").not.toBe(allow);
      if (phone) {
        const hints = await page.locator("body").innerText();
        expect(hints).not.toMatch(/Shift\+Enter|⌘\/Ctrl/);
        await expect(page.getByPlaceholder("向任务发送消息")).toBeVisible();
        await expect(page.getByText("内容由 AI 生成，请核实重要信息。")).toBeVisible();
      }

      if (phone) {
        // P6: details are a drawer opened from the header
        await expect(page.getByRole("complementary", { name: "任务详情" })).toBeHidden();
        await check(page, "task");
        await page.getByRole("button", { name: "展开详情" }).click();
        const drawer = page.getByRole("complementary", { name: "任务详情" });
        await expect(drawer).toBeVisible();
        await expect(page.getByTestId("panel-backdrop")).toBeVisible();
        const drawerBox = await drawer.boundingBox();
        expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(viewport.width + 1);
        await expect(drawer.getByText("理解目标并规划")).toBeVisible();
        await check(page, "task-drawer");
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
      } else {
        const panel = page.getByRole("complementary", { name: "任务详情" });
        await expect(panel).toBeVisible();
        await expect(page.getByTestId("panel-backdrop")).toHaveCount(0);
        await expect(panel.getByText("理解目标并规划")).toBeVisible();
        await expect(panel.getByText("Explore and plan")).toHaveCount(0);
        await expect(panel.getByTestId("usage-idle")).toContainText("暂无用量");
        await expect(panel.getByTestId("usage-row")).toHaveCount(0);
        // developer info is collapsed next to the event log and holds the version and ids
        const dev = panel.getByTestId("developer-info");
        await expect(dev.getByText("plan v3")).toBeHidden();
        await dev.getByText("开发者信息").click();
        await expect(dev.getByText("plan v3")).toBeVisible();
        await expect(dev.getByText("writer@1")).toBeVisible();
        await dev.getByText("开发者信息").click();
        await check(page, "task");
      }
    });

    test("SOP plan: steps nested under the SOP, approvals as approval items, plan approval card", async ({ page }) => {
      const sopStep = (role: string, index: number, subject: string) => ({ sop: "release@2", role, total: 3, step_id: subject, index, subject });
      const child = (id: string, title: string, status: string, step: ReturnType<typeof sopStep>, extra: Record<string, unknown> = {}) => node(id, title, status, { parent_node_id: "n_sop", sop_step: step, ...extra });
      const sopPlan = {
        ...plan,
        nodes: [
          node("n_0", "Explore and plan", "COMPLETED"),
          node("n_sop", "Release", "RUNNING", { type: "sop_stage", depends_on: ["n_0"] }),
          child("n_a", "Release 1/3: draft", "COMPLETED", sopStep("step", 1, "draft")),
          child("n_b", "Approve the start of Release 2/3: review", "COMPLETED", sopStep("approval_before", 2, "review")),
          child("n_c", "Release 2/3: review", "RETRY_PENDING", sopStep("step", 2, "review")),
          child("n_d", "Approve the result of Release 3/3: publish", "PENDING", sopStep("approval_after", 3, "publish")),
          child("n_e", "Release 3/3: publish", "BLOCKED", sopStep("step", 3, "publish")),
        ],
      };
      const sopEvents = [
        event(1, "task.created", { goal: task.goal, title: task.title }),
        event(2, "node.status_changed", { node_id: "n_c", to_status: "RETRY_PENDING", reason: "verifier refused: missing the changelog" }),
        event(3, "approval.requested", { approval_id: "apr_1", node_id: "n_d", subject: { kind: "sop_step", summary: "Accept the result of step 3/3 (publish) of release?", detail: "The publish step finished; accept it to continue." } }),
        event(4, "approval.requested", { approval_id: "apr_2", node_id: "n_x", subject: { kind: "node_approval", summary: "Ship the migration?", detail: "" } }),
      ];
      await page.unroute("**/v1/**");
      await mockBackend(page, { events: sopEvents as never, plan: sopPlan as never, task: { pending_approvals: ["apr_1", "apr_2"], profile: "default@1" } });
      await page.goto(`/tasks/${TASK_ID}`);
      await expect(page.getByTestId("approval-item")).toHaveCount(2);
      // both approval kinds render with the summary as the title, a plain approve / reject, and the accent bar
      const cards = page.getByTestId("approval-item");
      await expect(cards.nth(0)).toContainText("Accept the result of step 3/3");
      await expect(cards.nth(1)).toContainText("Ship the migration?");
      await expect(cards.nth(1).getByRole("button", { name: "批准" })).toBeVisible();
      await expect(cards.nth(1).getByTestId("attention-bar")).toBeVisible();
      await expect(cards.nth(1)).not.toContainText("需要你的确认");

      if (phone) await page.getByRole("button", { name: "展开详情" }).click();
      const panel = page.getByRole("complementary", { name: "任务详情" });
      const sop = panel.locator('[data-testid="plan-node"][data-sop="true"]');
      await expect(sop).toHaveCount(1);
      await expect(sop.getByTestId("sop-progress")).toContainText("已完成 1/3 步");
      await expect(sop.getByTestId("plan-step")).toHaveCount(5);
      await expect(sop.getByTestId("plan-step").nth(0)).toContainText("release · 第 1/3 步 · draft");
      await expect(sop.getByTestId("plan-step").nth(1)).toContainText("审批 · 步骤开始前");
      await expect(sop.getByTestId("plan-step").nth(3)).toContainText("审批 · 步骤完成后");
      await expect(sop.getByTestId("plan-step").nth(4)).toHaveAttribute("data-status", "BLOCKED");
      await expect(sop.getByTestId("plan-node-reason")).toContainText("missing the changelog");
      // top-level cards: the exploration node and the SOP only, never its steps beside it
      await expect(panel.getByTestId("plan-node")).toHaveCount(2);
      expect(await page.locator("body").innerText()).not.toMatch(/release@\d/);
      await check(page, phone ? "sop-plan-drawer" : "sop-plan");
    });

    test("dark theme: the task page keeps its surfaces and the approval stays the loudest card", async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ theme: "深色" })));
      await page.goto(`/tasks/${TASK_ID}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      const approval = page.getByTestId("approval-item");
      await approval.scrollIntoViewIfNeeded();
      const dark = await approval.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, page: getComputedStyle(document.body).color }));
      // a dark tinted surface, not the light 50 step
      const channels = dark.bg.match(/\d+/g)!.map(Number);
      expect(Math.max(...channels.slice(0, 3)), `approval surface ${dark.bg}`).toBeLessThan(80);
      await check(page, "task-dark");
    });

    test("experts list: Chinese labels, no frontmatter, no version", async ({ page }) => {
      await page.goto("/experts/agents");
      await expect(page.getByTestId("my-expert")).toHaveCount(1);
      const mine = page.getByTestId("my-expert");
      await expect(mine).toContainText("文案专家");
      await expect(mine).toContainText("你是一名文案专家");
      await expect(mine).not.toContainText(/v\d|---|description:/);
      await expect(page.getByRole("link", { name: "编辑" })).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/Development Tools|Finance|Others|--- name|ms-agent|qwenpaw|weird-framework|Mystery|v1\b/);
      await expect(page.getByRole("button", { name: /^开发工具 / })).toBeVisible();
      // counts are muted caption text, the label stays body
      const count = page.getByRole("button", { name: /^开发工具 / }).locator("span");
      expect(await count.evaluate((el) => getComputedStyle(el).fontSize)).toBe("12px");
      const label = await page.getByRole("button", { name: /^开发工具 / }).evaluate((el) => getComputedStyle(el).fontSize);
      expect(label).toBe("14px");
      expect(await count.evaluate((el) => getComputedStyle(el).color)).not.toBe(await page.getByRole("button", { name: /^金融 / }).evaluate((el) => getComputedStyle(el).color));
      await expect(page.getByRole("button", { name: /^金融 / })).toBeVisible();
      await expect(page.getByText("千问智能体")).toBeVisible();
      await expect(page.getByText("魔搭智能体")).toBeVisible();
      await expect(page.getByText("把财报和指引里的冲突找出来")).toBeVisible();
      await check(page, "experts");
    });

    test("coming-soon page: quiet nav entry, no disabled primary action, user copy", async ({ page }) => {
      await page.goto("/projects");
      await expect(page.getByRole("heading", { name: "项目", exact: true })).toBeVisible();
      await expect(page.getByText("项目功能即将上线，现在可以先用任务完成工作。")).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/没有接入后端|还没有接入/);
      await expect(page.locator("button:disabled")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "新建项目" })).toHaveCount(0);
      await check(page, "soon");
    });

    test("other pages fit the width: skills, connectors, expert editor, connector form, settings, 404", async ({ page }) => {
      for (const [path, name, ready] of [
        ["/experts/skills", "skills", "周报写作"],
        ["/experts/connectors", "connectors", "文档检索"],
        ["/experts/new", "expert-editor", "创建专家"],
        ["/experts/connectors/new", "connector-form", "自定义创建"],
        ["/settings", "settings", "本地部署"],
        ["/nope", "not-found", "404"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        await check(page, name);
      }
    });

    test("sidebar: group labels hug their group, coming-soon entries are quiet; a drawer on phones", async ({ page }) => {
      await page.goto("/");
      const sidebar = page.getByRole("complementary", { name: "侧边栏" });
      if (phone) {
        // P6
        await expect(sidebar).toBeHidden();
        await page.getByRole("button", { name: "展开侧边栏" }).click();
        await expect(sidebar).toBeVisible();
        await expect(page.getByTestId("sidebar-backdrop")).toBeVisible();
        await check(page, "sidebar-drawer");
        await page.getByTestId("sidebar-backdrop").click({ position: { x: viewport.width - 10, y: 400 } });
        await expect(sidebar).toBeHidden();
        await page.getByRole("button", { name: "展开侧边栏" }).click();
        await page.getByRole("link", { name: "专家" }).click();
        await expect(page).toHaveURL(/\/experts\/agents$/);
        await expect(sidebar).toBeHidden();
        return;
      }
      await expect(sidebar).toBeVisible();
      // P7: gap above a label is at least twice the gap below it
      for (const group of await page.getByTestId("nav-group").all()) {
        const label = await group.locator("p").boundingBox();
        const previous = await group.locator("xpath=preceding-sibling::*[1]").boundingBox();
        const first = await group.locator("a").first().boundingBox();
        const above = label!.y - (previous!.y + previous!.height);
        const below = first!.y - (label!.y + label!.height);
        expect(above, `gap above ${above}px vs below ${below}px`).toBeGreaterThanOrEqual(below * 2);
      }
      const look = (name: string) => page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name }).evaluate((el) => ({ weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color }));
      const real = await look("专家");
      const soon = await look("项目 即将");
      expect(soon.weight).toBe("400");
      expect(real.weight).toBe("500");
      expect(soon.color).not.toBe(real.color);
      await check(page, "sidebar");
    });
  });
}
