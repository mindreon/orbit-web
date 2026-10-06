/**
 * The task page's right panel and the sub-agent chips in the chat, with a route-mocked API.
 * Screenshots go to e2e-artifacts/panel/ (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   R1 the chat shows more than three member chips, or no 「另有 N 个」, or the status phrase is wrong / not a live region
 *   R2 a chip does not open the 子智能体 tab on that member, or going back loses the list's scroll position
 *   R3 the list does not group members into 进行中 and 已结束, or an empty group has no text
 *   R4 a file tab has no close ×, shows it on an idle inactive tab, or the preview header loses the file name behind a long path
 *   R5 maximize does not hide the conversation, or Esc does not restore it
 *   R6 dragging the left edge does not resize (or clamp, or collapse), the width is lost on reload, the keyboard does not resize
 *   R7 the drawer at 390px scrolls sideways, shows a resize handle or a maximize button
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/panel";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const START = "2026-10-05T08:00:00Z";
const WIDTH_KEY = "orbit.taskPanelWidth";
const PATH = "reports/2026-q3/release-readiness/weekly/风险摘要.md";
const LONG_PATH = "workspace/projects/orbit/release-readiness/2026-q3/weekly-risk-review/appendix/风险摘要.md";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const task = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理本周发布风险",
  goal: "把本周的发布风险整理成一页摘要。",
  mode: "single",
  status: "RUNNING",
  profile: "writer@1",
  plan_version: 1,
  created_by: "user-a",
  created_at: START,
  updated_at: START,
  budgets: {},
  usage: {},
};

const members = [
  { role: "member-1", label: "主编", expert: "writer@1", name: "文案专家", description: "统筹" },
  { role: "member-2", label: "研究员", expert: "research@1", name: "调研专家", description: "找资料" },
  { role: "member-3", label: "评审员", expert: "reviewer@1", name: "评审专家", description: "把关" },
  { role: "member-4", label: "撰稿人", expert: "drafter@1", name: "撰稿专家", description: "写初稿" },
  { role: "member-5", label: "校对员", expert: "proof@1", name: "校对专家", description: "查错字" },
  { role: "member-6", label: "排版员", expert: "layout@1", name: "排版专家", description: "出版式" },
];
const teamConfig = { config_version: 2, expert: "writer@1", skills: null, connector_ids: null, mode: "default", team_ref: "team1@1", team: { ref: "team1@1", leader: "member-1", members } };
const plan = {
  plan_version: 1,
  hash: `sha256:${"a".repeat(64)}`,
  nodes: [
    { node_id: "n_1", type: "agent_turn", title: "Explore and plan", status: "COMPLETED", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: true, attempt_count: 1 },
    { node_id: "n_f", type: "agent_turn", title: "校对附录", status: "FAILED", depends_on: ["n_1"], workspace_access: "write", owner_profile: "proof@1", frozen: false, attempt_count: 1, parent_node_id: "n_1", owner_role: "member-5", owner_label: "校对员" },
  ],
  edges: [],
};

type Scenario = "mixed" | "failed" | "running";

let seq = 0;
const event = (type: string, payload: Record<string, unknown>, at = START) => ({ seq: (seq += 1), event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: at });
const message = (kind: string, from: string, to: string[], text: string, at: string) =>
  event("team.message", { node_id: "n_stage", attempt_id: "att_stage", kind, from_role: from, from_label: members.find((m) => m.role === from)?.label ?? "", role: from, to_roles: to, text, round: 1, hop: 0, artifacts: [] }, at);
let ephemeral = 0;
const worker = (type: string, role: string, payload: Record<string, unknown>, after: number) => ({
  ...event(type, { attempt_id: "att_stage", team_role: role, team_label: members.find((m) => m.role === role)?.label, team_session: `sess-${role}`, ...payload }),
  seq: 0,
  event_id: `eph_${(ephemeral += 1)}`,
  after_seq: after,
});

/** One leader turn that handed work to members; what each member is doing depends on the scenario. */
function events(scenario: Scenario) {
  seq = 0;
  const list = [
    event("task.created", { goal: task.goal, title: task.title }, ago(40)),
    event("attempt.started", { attempt_id: "att_1", node_id: "n_1", attempt_no: 1, profile: "writer@1" }, ago(39)),
    event("message.agent_final", { attempt_id: "att_1", text: "我把工作拆开了，请各位成员分头处理。" }, ago(38)),
    event("attempt.finished", { attempt_id: "att_1", node_id: "n_1", outcome: "completed" }, ago(38)),
  ];
  if (scenario === "mixed") {
    for (const role of ["member-2", "member-3", "member-4", "member-5", "member-6"]) list.push(message("assign", "member-1", [role], `请 ${role} 处理本周的发布风险`, ago(37)));
    list.push(message("reply", "member-2", ["member-1"], "三项风险：迁移窗口、证书到期、灰度比例。", ago(12)));
    list.push(message("reply", "member-6", ["member-1"], "版式已经排好。", ago(3)));
  } else if (scenario === "failed") {
    for (const role of ["member-2", "member-5"]) list.push(message("assign", "member-1", [role], `请 ${role} 处理本周的发布风险`, ago(37)));
    list.push(message("reply", "member-2", ["member-1"], "三项风险：迁移窗口、证书到期、灰度比例。", ago(12)));
  } else {
    for (const role of ["member-2", "member-3"]) list.push(message("assign", "member-1", [role], `请 ${role} 处理本周的发布风险`, ago(1)));
  }
  const last = list.length;
  if (scenario === "failed" || scenario === "mixed") {
    list.push(event("attempt.started", { attempt_id: "att_f", node_id: "n_f", attempt_no: 1, profile: "proof@1" }, ago(30)));
    list.push(event("attempt.finished", { attempt_id: "att_f", node_id: "n_f", outcome: "failed", error: "附录文件读不出来" }, ago(20)));
  }
  if (scenario === "mixed") list.push(worker("agent.token_delta", "member-3", { block_id: "b1", text: "回滚步骤缺少数据库回退的验证。" }, last));
  if (scenario === "running") list.push(worker("agent.token_delta", "member-2", { block_id: "b1", text: "正在查资料。" }, last));
  return list;
}

const entry = (name: string, mediaType: string) => ({ name, media_type: mediaType, size_bytes: 128, blob_ref: "sha256:x" });
const SOURCE = "# 风险摘要\n\n本周有三项风险需要处理。";
const LONG_TEXT = Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 行：迁移窗口与大促重叠，需要提前确认回滚方案。`).join("\n");

async function mockBackend(page: Page, scenario: Scenario = "mixed") {
  const feed = events(scenario);
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
    const { pathname, searchParams } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (pathname === "/v1/tasks") return json({ items: [task] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json(task);
    if (pathname.endsWith("/plan")) return json(plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [{ manifest_id: "man_1", task_id: TASK_ID, attempt_id: "att_1", entries: [entry(PATH, "text/markdown"), entry(LONG_PATH, "text/markdown"), entry("notes.txt", "text/plain")], created_at: START }] });
    if (pathname.endsWith("/config")) return json(teamConfig);
    if (pathname === "/v1/artifacts/man_1/url") return json({ url: `http://artifacts.test/${searchParams.get("name")}` });
    if (pathname === "/v1/experts") return json({ items: [] });
    if (pathname === "/v1/models") return json({ items: ["test-model"], default: "test-model" });
    return json({ items: [], total: 0 });
  });
  await page.route("http://artifacts.test/**", (route) => route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, contentType: "text/plain", body: new URL(route.request().url()).pathname.endsWith("notes.txt") ? LONG_TEXT : SOURCE }));
}

const panelOf = (page: Page) => page.getByRole("complementary", { name: "任务详情" });
const handleOf = (page: Page) => page.getByRole("separator", { name: "调整详情宽度" });
const widthOf = async (locator: Locator) => Math.round((await locator.boundingBox())!.width);
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), WIDTH_KEY);

async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** Drag the panel's left edge by `dx` (negative = wider), in small steps like a hand. */
async function drag(page: Page, dx: number) {
  const box = (await handleOf(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 5 });
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.mouse.up();
}

test.describe("desktop 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("chips: three at most, 另有 N 个, one status phrase in a live region", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const roster = page.getByTestId("team-roster");
    await expect(roster).toHaveCount(1);
    await expect(roster.getByTestId("roster-member")).toHaveCount(3);
    await expect(roster.getByTestId("roster-more")).toHaveText("另有 2 个");
    await expect(roster.getByTestId("roster-status")).toHaveText("已开始工作");
    await expect(roster.getByTestId("roster-status")).toHaveAttribute("aria-live", "polite");
    await expect(roster.locator('[data-testid="roster-member"][data-role="member-3"]')).toHaveAttribute("data-status", "running");
    await expect(roster.locator('[data-testid="roster-member"][data-role="member-4"]')).toHaveAttribute("data-status", "waiting");
    // A chip is a 28px pill with a 1px border and a 20px avatar; its name is the member's, not a role id.
    const chip = roster.getByTestId("roster-member").first();
    expect(Math.round((await chip.boundingBox())!.height)).toBe(28);
    await expect(chip).toContainText("调研专家");
    await expect(chip.getByTestId("avatar")).toHaveCSS("width", "20px");
    await expect(chip).toHaveCSS("border-top-width", "1px");
    await expect(chip).toHaveCSS("border-radius", "9999px");
    const rest = await chip.evaluate((el) => getComputedStyle(el).borderTopColor);
    await chip.hover();
    expect(await chip.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(rest);
    await snap(page, "light-1440x900-chat");
  });

  test("a failed member is counted in the phrase when nobody is running", async ({ page }) => {
    await mockBackend(page, "failed");
    await page.goto(`/tasks/${TASK_ID}`);
    const status = page.getByTestId("team-roster").getByTestId("roster-status");
    await expect(status).toHaveText("1 个失败");
    await expect(status).toHaveClass(/text-danger-700/);
    await expect(page.getByTestId("team-roster").getByTestId("roster-more")).toHaveCount(0);
    await expect(page.getByTestId("team-roster").locator('[data-testid="roster-member"][data-status="failed"]')).toHaveCount(1);
  });

  test("a chip opens the 子智能体 tab on that member; back restores the list; the list is grouped", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    // The panel opens on 概览; a 子智能体 tab sits next to it, before any file tab.
    await expect(panel.getByRole("button", { name: "概览" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("button", { name: "子智能体" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("panel-member")).toHaveCount(0);

    await page.getByTestId("team-roster").locator('[data-testid="roster-member"][data-role="member-3"]').click();
    await expect(panel.getByRole("button", { name: "子智能体" })).toHaveAttribute("aria-pressed", "true");
    const detail = page.getByTestId("panel-member");
    await expect(detail).toHaveAttribute("data-role", "member-3");
    await expect(detail).toContainText("评审专家");
    await expect(detail).toContainText("评审员");
    await expect(detail).toContainText("回滚步骤缺少数据库回退的验证。");
    await snap(page, "light-1440x900-member");

    await detail.getByRole("button", { name: "返回" }).click();
    await expect(page.getByTestId("panel-member")).toHaveCount(0);
    const list = page.getByTestId("subagent-list");
    // Running or waiting; done or failed.
    const active = list.locator('[data-testid="subagent-group"][data-group="active"]');
    const ended = list.locator('[data-testid="subagent-group"][data-group="ended"]');
    await expect(active.getByRole("heading")).toHaveText("进行中 · 2");
    await expect(ended.getByRole("heading")).toHaveText("已结束 · 3");
    await expect(active.getByTestId("subagent-row")).toHaveCount(2);
    await expect(ended.getByTestId("subagent-row")).toHaveCount(3);
    await expect(active.locator('[data-role="member-3"]')).toHaveAttribute("data-status", "running");
    await expect(active.locator('[data-role="member-4"]')).toHaveAttribute("data-status", "waiting");
    await expect(ended.locator('[data-role="member-5"]')).toHaveAttribute("data-status", "failed");
    await expect(ended.locator('[data-role="member-2"]')).toHaveAttribute("data-status", "done");
    // A row: 32px avatar, the member's name, a muted line with the role, and when it last did anything.
    const row = ended.locator('[data-role="member-2"]');
    await expect(row.getByTestId("avatar")).toHaveCSS("width", "32px");
    await expect(row).toContainText("调研专家");
    await expect(row).toContainText("研究员");
    await expect(row).toContainText(/\d+分钟前|刚刚/);
    await snap(page, "light-1440x900-subagents");

    // A row opens the same detail.
    await ended.locator('[data-role="member-6"]').click();
    await expect(page.getByTestId("panel-member")).toHaveAttribute("data-role", "member-6");
  });

  test("an empty group says so", async ({ page }) => {
    await mockBackend(page, "running");
    await page.goto(`/tasks/${TASK_ID}`);
    await panelOf(page).getByRole("button", { name: "子智能体" }).click();
    await expect(page.locator('[data-group="active"] [data-testid="subagent-row"]')).toHaveCount(2);
    await expect(page.locator('[data-group="ended"]').getByRole("heading")).toHaveText("已结束 · 0");
    await expect(page.locator('[data-group="ended"]')).toContainText("尚无已结束的子智能体。");

    await mockBackend(page, "failed");
    await page.goto(`/tasks/${TASK_ID}`);
    await panelOf(page).getByRole("button", { name: "子智能体" }).click();
    await expect(page.locator('[data-group="active"]')).toContainText("尚无进行中的子智能体。");
  });

  test("going back from a member restores where the list was scrolled", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 380 });
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    await panelOf(page).getByRole("button", { name: "子智能体" }).click();
    const scroller = page.getByTestId("panel-agents");
    const overflowing = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflowing, "the list has to be taller than the panel for this to mean anything").toBeGreaterThan(20);
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const before = await scroller.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.locator('[data-testid="subagent-row"]').last().click();
    await expect(page.getByTestId("panel-member")).toBeVisible();
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
    await page.getByRole("button", { name: "返回" }).click();
    await expect(page.getByTestId("subagent-list")).toBeVisible();
    expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - before)).toBeLessThanOrEqual(1);
  });

  test("file tabs open from the overview, close on hover or when active; the preview names the file; Markdown has a source view", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    await panel.getByRole("button", { name: /风险摘要\.md/ }).first().click();
    await panel.getByRole("button", { name: "概览" }).click();
    await panel.getByRole("button", { name: /notes\.txt/ }).first().click();

    // The tab is labelled with the file's name, not its path; the path is the tooltip.
    const first = panel.getByRole("button", { name: "风险摘要.md", exact: true });
    await expect(first).toHaveAttribute("title", PATH);
    const closeFirst = panel.getByRole("button", { name: "关闭 风险摘要.md" });
    const closeSecond = panel.getByRole("button", { name: "关闭 notes.txt" });
    // The active tab shows its ×; an idle one only on hover or focus.
    await expect(closeSecond).toHaveCSS("opacity", "1");
    await expect(closeFirst).toHaveCSS("opacity", "0");
    await first.hover();
    await expect(closeFirst).toHaveCSS("opacity", "1");
    // Tabs are 28px tall pills, at most 13rem wide.
    const tab = first.locator("xpath=..");
    const box = (await tab.boundingBox())!;
    expect(Math.round(box.height)).toBe(28);
    expect(box.width).toBeLessThanOrEqual(13 * 16 + 1);

    // Preview header: the directory is muted and cut from the start, then ›, then the bold name; copy path is on the right.
    await first.click();
    const preview = page.getByTestId("artifact-preview");
    await expect(preview.getByRole("heading", { name: "风险摘要" })).toBeVisible();
    await expect(preview.getByTestId("preview-dir")).toHaveCSS("direction", "rtl");
    await expect(preview.getByTestId("preview-dir").locator("bdi")).toHaveAttribute("dir", "ltr");
    await expect(preview.getByTestId("preview-path")).toContainText("风险摘要.md");
    await preview.getByRole("button", { name: "复制路径" }).click();
    await expect(preview.getByRole("button", { name: "已复制路径" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PATH);

    // Markdown: 预览 renders it, 源码 shows the text as written.
    await preview.getByRole("button", { name: "源码" }).click();
    await expect(preview.getByRole("heading", { name: "风险摘要" })).toHaveCount(0);
    await expect(preview).toContainText("# 风险摘要");
    await preview.getByRole("button", { name: "预览" }).click();
    await expect(preview.getByRole("heading", { name: "风险摘要" })).toBeVisible();
    await snap(page, "light-1440x900-file");

    // A path too long for the header loses its start, never the file name.
    await panel.getByRole("button", { name: "概览" }).click();
    await panel.getByRole("button", { name: new RegExp(LONG_PATH.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) }).click();
    const dir = page.getByTestId("preview-dir");
    await expect(dir).toBeVisible();
    expect(await dir.evaluate((el) => el.scrollWidth > el.clientWidth), "the long directory is cut").toBe(true);
    await expect(page.getByTestId("preview-path").locator("span").last()).toBeInViewport();
    await expect(page.getByTestId("preview-path").locator("span").last()).toHaveText("风险摘要.md");

    // Closing the active tab goes back to 概览; the others stay.
    const tabs = panel.getByRole("button", { name: "风险摘要.md" });
    await expect(tabs).toHaveCount(4); // two tabs and their × (one name each), the long path's tab included
    await panel.getByRole("button", { name: "关闭 notes.txt" }).click();
    await expect(page.getByRole("button", { name: "关闭 notes.txt" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "风险摘要.md", exact: true })).toHaveCount(2);
  });

  test("the overview and 子智能体 tabs stay pinned while file tabs scroll; the preview fills the panel and scrolls inside itself", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    await handleOf(page).focus();
    await page.keyboard.press("Home"); // 20rem: three file tabs cannot all fit
    for (const name of [new RegExp(PATH.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")), new RegExp(LONG_PATH.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")), /notes\.txt/]) {
      await panel.getByRole("button", { name: "概览" }).click();
      await panel.getByRole("button", { name }).first().click();
    }
    const strip = page.getByTestId("file-tabs");
    await expect(strip.getByRole("button", { name: "关闭 notes.txt" })).toBeVisible();
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth), "the file tabs overflow their strip").toBe(true);
    const edge = (await panel.boundingBox())!;
    for (const name of ["概览", "子智能体"]) {
      const box = (await panel.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(box.x, `${name} stays at the left`).toBeGreaterThanOrEqual(edge.x);
      expect(box.x + box.width, `${name} is not under the file tabs`).toBeLessThanOrEqual((await strip.boundingBox())!.x + 1);
    }
    // The active file tab is scrolled into view inside the strip.
    const stripBox = (await strip.boundingBox())!;
    const active = (await panel.getByRole("button", { name: "notes.txt", exact: true }).boundingBox())!;
    // (At 20rem the strip is narrower than one tab, so the tab starts at the strip's left edge rather than fitting inside it.)
    expect(active.x).toBeGreaterThanOrEqual(stripBox.x - 1);
    expect(active.x).toBeLessThan(stripBox.x + stripBox.width);
    await snap(page, "light-1440x900-tabs");

    // Text: one surface from the header to the bottom of the panel; the long file scrolls inside it.
    const body = page.getByTestId("artifact-preview").locator("> div").last();
    const filled = async () => {
      const [b, p] = await Promise.all([body.boundingBox(), panel.boundingBox()]);
      expect(Math.round(b!.y + b!.height), "the preview surface reaches the bottom of the panel").toBe(Math.round(p!.y + p!.height));
      expect(await body.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await page.evaluate(() => getComputedStyle(document.querySelector("main")!).backgroundColor));
    };
    await expect(page.getByTestId("artifact-preview")).toContainText("第 80 行");
    await filled();
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await snap(page, "light-1440x900-file-text");

    // Markdown, rendered and as source: short content, same full-height surface.
    await panel.getByRole("button", { name: "风险摘要.md", exact: true }).first().click();
    await expect(page.getByTestId("artifact-preview").getByRole("heading", { name: "风险摘要" })).toBeVisible();
    await filled();
    await page.getByTestId("artifact-preview").getByRole("button", { name: "源码" }).click();
    await expect(page.getByTestId("artifact-preview")).toContainText("# 风险摘要");
    await filled();
  });

  test("maximize hides the conversation; Esc and the button restore it", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    const column = page.getByTestId("conversation-column");
    await expect(column).toBeVisible();
    const sidebarRight = (await page.getByRole("navigation", { name: "主导航" }).boundingBox())!;
    const normal = await widthOf(panel);
    await panel.getByRole("button", { name: "最大化" }).click();
    await expect(column).toBeHidden();
    await expect(panel.getByRole("button", { name: "还原" })).toBeVisible();
    await expect(handleOf(page)).toHaveCount(0);
    // The panel takes everything right of the left sidebar.
    const box = (await panel.boundingBox())!;
    expect(Math.abs(box.x - (sidebarRight.x + sidebarRight.width))).toBeLessThanOrEqual(2);
    expect(Math.round(box.x + box.width)).toBe(1440);
    await snap(page, "light-1440x900-maximized");
    await page.keyboard.press("Escape");
    await expect(column).toBeVisible();
    expect(await widthOf(panel)).toBe(normal);

    await panel.getByRole("button", { name: "最大化" }).click();
    await expect(column).toBeHidden();
    await panel.getByRole("button", { name: "还原" }).click();
    await expect(column).toBeVisible();
    // Collapsing while maximized does not leave the page without a conversation next time.
    await panel.getByRole("button", { name: "最大化" }).click();
    await panel.getByRole("button", { name: "收起详情" }).click();
    await expect(column).toBeVisible();
    await page.getByRole("button", { name: "展开详情" }).click();
    await expect(column).toBeVisible();
  });

  test("dragging the left edge resizes within 20rem and min(60rem, 70vw), persists, and collapses below half the minimum", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    const handle = handleOf(page);
    await expect(handle).toHaveAttribute("aria-orientation", "vertical");
    await expect(handle).toHaveAttribute("aria-valuemin", "320");
    await expect(handle).toHaveAttribute("aria-valuemax", "960");
    // 26rem by default at this width; nothing stored yet.
    expect(await widthOf(panel)).toBe(416);
    await expect(handle).toHaveAttribute("aria-valuenow", "416");
    expect(await stored(page)).toBeNull();
    const hit = (await handle.boundingBox())!;
    expect(hit.width).toBe(12);

    // The line lights up on hover.
    const line = handle.locator("span");
    const idle = await line.evaluate((el) => getComputedStyle(el).backgroundColor);
    await handle.hover();
    await expect.poll(() => line.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(idle);

    // During the drag the width follows the pointer, but nothing is stored until it ends.
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 6, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 6 - 100, box.y + 300, { steps: 6 });
    await expect(handle).toHaveAttribute("data-dragging", "true");
    expect(await widthOf(panel)).toBe(516);
    await expect(handle).toHaveAttribute("aria-valuenow", "516");
    expect(await stored(page)).toBeNull();
    await page.mouse.up();
    await expect(handle).toHaveAttribute("data-dragging", "false");
    expect(await widthOf(panel)).toBe(516);
    expect(await stored(page)).toBe("516");

    // The width survives a reload.
    await page.reload();
    expect(await widthOf(panelOf(page))).toBe(516);
    await expect(handleOf(page)).toHaveAttribute("aria-valuenow", "516");

    // Too wide stops at min(60rem, 70vw); too narrow (but not under half the minimum) stops at 20rem.
    await drag(page, -2000);
    expect(await widthOf(panelOf(page))).toBe(960);
    expect(await stored(page)).toBe("960");
    await drag(page, 700);
    expect(await widthOf(panelOf(page))).toBe(320);
    expect(await stored(page)).toBe("320");

    // Released under half the minimum (160px): the panel collapses, and keeps the width it had.
    await drag(page, 400);
    await expect(panelOf(page)).toHaveCount(0);
    await page.getByRole("button", { name: "展开详情" }).click();
    expect(await widthOf(panelOf(page))).toBe(320);
    await snap(page, "light-1440x900-resized");
  });

  test("keyboard: arrows 8px, Shift 32px, Home and End", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    const panel = panelOf(page);
    const handle = handleOf(page);
    await handle.focus();
    // The panel is on the right: ← moves its edge left, so it grows.
    await page.keyboard.press("ArrowLeft");
    expect(await widthOf(panel)).toBe(424);
    await page.keyboard.press("Shift+ArrowLeft");
    expect(await widthOf(panel)).toBe(456);
    await page.keyboard.press("ArrowRight");
    expect(await widthOf(panel)).toBe(448);
    await page.keyboard.press("Shift+ArrowRight");
    expect(await widthOf(panel)).toBe(416);
    await expect(handle).toHaveAttribute("aria-valuenow", "416");
    expect(await stored(page)).toBe("416");
    await page.keyboard.press("Home");
    expect(await widthOf(panel)).toBe(320);
    await page.keyboard.press("ArrowRight");
    expect(await widthOf(panel)).toBe(320);
    await page.keyboard.press("End");
    expect(await widthOf(panel)).toBe(960);
    await page.keyboard.press("ArrowLeft");
    expect(await widthOf(panel)).toBe(960);
    await expect(handle).toBeFocused();
    expect(await stored(page)).toBe("960");
  });

  test("a stored width that no longer fits is clamped; an unusable store falls back to the default", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    await page.evaluate((key) => localStorage.setItem(key, "99999"), WIDTH_KEY);
    await page.reload();
    expect(await widthOf(panelOf(page))).toBe(960);
    await page.evaluate((key) => localStorage.setItem(key, "nonsense"), WIDTH_KEY);
    await page.reload();
    expect(await widthOf(panelOf(page))).toBe(416);
  });

  test("dark theme", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("orbit.uiPrefs", JSON.stringify({ theme: "深色" })));
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("team-roster")).toBeVisible();
    await snap(page, "dark-1440x900-chat");
    await panelOf(page).getByRole("button", { name: "子智能体" }).click();
    await expect(page.getByTestId("subagent-list")).toBeVisible();
    await snap(page, "dark-1440x900-subagents");
    await page.locator('[data-testid="subagent-row"][data-role="member-3"]').click();
    await expect(page.getByTestId("panel-member")).toBeVisible();
    await snap(page, "dark-1440x900-member");
    await panelOf(page).getByRole("button", { name: "概览" }).click();
    await panelOf(page).getByRole("button", { name: /风险摘要\.md/ }).first().click();
    await expect(page.getByTestId("artifact-preview").getByRole("heading", { name: "风险摘要" })).toBeVisible();
    await snap(page, "dark-1440x900-file");
  });
});

test.describe("phone 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the drawer has no resize handle or maximize button, and nothing scrolls sideways", async ({ page }) => {
    await mockBackend(page, "mixed");
    await page.goto(`/tasks/${TASK_ID}`);
    // Against 390, not window.innerWidth: a mobile layout viewport grows with the overflowing content, which would hide it.
    const fits = async (name: string) => {
      const { scroll, body } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(scroll, `${name}: documentElement scrolls sideways`).toBeLessThanOrEqual(390);
      expect(body, `${name}: body scrolls sideways`).toBeLessThanOrEqual(390);
    };
    // The chips wrap inside the column instead of pushing the page wide.
    await expect(page.getByTestId("team-roster").getByTestId("roster-member")).toHaveCount(3);
    await fits("chat");
    for (const box of await page.getByTestId("roster-member").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right))) expect(box).toBeLessThanOrEqual(390);
    await snap(page, "light-390x844-chat");

    // A chip opens the drawer on that member.
    await expect(panelOf(page)).toBeHidden();
    await page.locator('[data-testid="roster-member"][data-role="member-4"]').click();
    const drawer = panelOf(page);
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("panel-member")).toHaveAttribute("data-role", "member-4");
    await expect(handleOf(page)).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "最大化" })).toHaveCount(0);
    const rect = (await drawer.boundingBox())!;
    expect(rect.x + rect.width).toBeLessThanOrEqual(390 + 1);
    await fits("drawer member");
    await snap(page, "light-390x844-member");

    await drawer.getByRole("button", { name: "返回" }).click();
    await expect(page.getByTestId("subagent-list")).toBeVisible();
    await fits("drawer list");
    await snap(page, "light-390x844-subagents");

    // Open files: a long path in a narrow drawer.
    await drawer.getByRole("button", { name: "概览" }).click();
    await drawer.getByRole("button", { name: new RegExp(LONG_PATH.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) }).click();
    await expect(page.getByTestId("artifact-preview").getByRole("heading", { name: "风险摘要" })).toBeVisible();
    await fits("drawer file");
    await snap(page, "light-390x844-file");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
