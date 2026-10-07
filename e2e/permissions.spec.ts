/**
 * Permissions: the settings 权限 section, the composer's permission picker (home and in a task), the slash command, and the risk tag
 * on approval cards. Route-mocked API; a fake EventSource. Screenshots go to e2e-artifacts/permissions/ (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   M1 the settings do not load (default preset selected, custom values shown), or an edit does not PUT the whole body, or "已保存" never shows
 *   M2 the default preset is not a radio group (one checked row, arrows move), or choosing 完全访问权限 saves without asking, or cancelling still saves
 *   M3 写入权限 禁止写入 leaves 编辑文件无需审批 usable; 读取权限 can be changed; a switch does not PUT its rule
 *   M4 a failed save keeps the optimistic value, or says nothing
 *   M5 against a control without /v1/settings (404) the page breaks, hides the controls, lets them be edited, or shows no quiet note
 *   M6 the new-task composer does not start from the user's default, a pick of hers is overwritten by a late settings read, or POST /v1/tasks lacks config.permissions
 *   M7 picking 完全访问 (home or task) takes effect without a confirmation, asks twice in one task, or a cancel changes anything
 *   M8 in a task the pick does not go through PUT /config with the base version, or the 下一次执行起生效 hint is missing
 *   M9 「/」 does not offer 权限 or it does not open the menu
 *   M10 an approval card shows no 高风险 / 需要确认 tag, shows one for low or an absent risk
 *   M11 at 390px the menu or the settings sideways-scroll or leave the screen; in the dark theme the danger row is not the danger colour; a font size outside the six is drawn
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/permissions";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const NOW = "2026-10-05T08:00:00Z";
const FONT_SIZES = new Set([12, 13, 14, 16, 20, 24]);
const CUSTOM = { write_scope: "workspace", auto_edits: true, auto_commands: false, auto_builtin: false };
const settingsBody = (default_preset = "default", custom: Record<string, unknown> = CUSTOM) => ({ permissions: { default_preset, custom } });

const baseTask = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理本周发布风险",
  goal: "把本周的发布风险整理成一页摘要。",
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
const expert = { expert_id: "writer", ref: "writer@1", version: 1, name: "文案专家", instructions: "你是一名文案专家。", model: "test-model", connector_ids: [], skill_ids: [], created_at: NOW };
const plan = { plan_version: 1, hash: `sha256:${"a".repeat(64)}`, nodes: [{ node_id: "n_2", type: "agent_turn", title: "Draft report", status: "RUNNING", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: false, attempt_count: 1 }], edges: [] };

let seq = 0;
const event = (type: string, payload: Record<string, unknown>) => {
  seq += 1;
  return { seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: NOW };
};
const baseEvents = () => {
  seq = 0;
  return [event("task.created", { goal: baseTask.goal, title: baseTask.title }), event("attempt.started", { attempt_id: "att_1", node_id: "n_2", attempt_no: 1, profile: "writer@1" }), event("message.agent_final", { attempt_id: "att_1", text: "我先看了发布计划。" })];
};
const approval = (id: string, detail: string, risk?: string) =>
  event("approval.requested", { approval_id: id, node_id: "n_2", attempt_id: "att_1", subject: { kind: "tool_call", summary: "Bash", detail, ...(risk ? { risk } : {}), allow_rule: { tool_name: "Bash", rule_content: "ls:*" } } });

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}
interface Scene {
  /** What GET /v1/settings answers: a body, or a status to refuse with. */
  settings?: Record<string, unknown> | 404 | 501;
  /** PUT /v1/settings refuses with this status. */
  putFails?: number;
  /** The task's configuration. */
  permissions?: Record<string, unknown>;
  events?: ReturnType<typeof event>[];
  task?: Record<string, unknown>;
  theme?: "dark";
  /** Milliseconds GET /v1/settings is held back. */
  slowSettings?: number;
}

async function mockBackend(page: Page, scene: Scene = {}) {
  const calls: Call[] = [];
  const state = { settings: scene.settings && typeof scene.settings === "object" ? scene.settings : settingsBody(), config: { config_version: 1, expert: "writer@1", skills: null, connector_ids: null, mode: "default", ...(scene.permissions ? { permissions: scene.permissions } : {}) } as Record<string, unknown> };
  const feed = scene.events ?? baseEvents();
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
      if (pathname === "/v1/settings") {
        if (scene.putFails) return route.fulfill({ status: scene.putFails, json: { message: "存储暂时不可用" } });
        state.settings = body ?? state.settings;
        return json(state.settings);
      }
      if (pathname === "/v1/tasks") return json({ ...baseTask, task_id: TASK_ID });
      if (pathname.endsWith("/config")) {
        const input = body as { permissions?: Record<string, unknown> };
        const version = (state.config.config_version as number) + 1;
        state.config = { ...state.config, config_version: version, ...(input.permissions ? { permissions: input.permissions.preset === "custom" ? { ...input.permissions, ...CUSTOM } : input.permissions } : {}) };
        return json({ config_version: version, effective: "next_run" });
      }
      return json({});
    }
    if (pathname === "/v1/settings") {
      if (scene.slowSettings) await new Promise((resolve) => setTimeout(resolve, scene.slowSettings));
      if (scene.settings === 404 || scene.settings === 501) return route.fulfill({ status: scene.settings, json: { message: "not found" } });
      return json(state.settings);
    }
    if (pathname === "/v1/tasks") return json({ items: [{ ...baseTask, ...scene.task }] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json({ ...baseTask, ...scene.task });
    if (pathname.endsWith("/plan")) return json(plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [] });
    if (pathname.endsWith("/config")) return json(state.config);
    if (pathname === "/v1/experts") return json({ items: [expert] });
    if (pathname === "/v1/models") return json({ items: ["test-model"], default: "test-model" });
    return json({ items: [], total: 0 });
  });
  return { calls, state };
}

const puts = (calls: Call[], path: string) => calls.filter((call) => call.method === "PUT" && call.path === path);
const openSettings = async (page: Page) => {
  await page.goto("/settings?section=权限");
  await expect(page.getByRole("radiogroup", { name: "新任务默认权限" })).toBeVisible();
};
const openTask = async (page: Page) => {
  await page.goto(`/tasks/${TASK_ID}`);
  await expect(page.getByTestId("composer")).toBeAttached();
  await expect(page.getByTestId("permission-chip")).toBeEnabled();
};
const radio = (page: Page, name: string) => page.getByRole("radiogroup", { name: "新任务默认权限" }).getByRole("radio", { name });
const chip = (page: Page) => page.getByTestId("permission-chip");
const menu = (page: Page) => page.getByRole("menu", { name: "应如何批准 Agent 操作？" });
const sideways = (page: Page) => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }));

async function renderedFontSizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const sizes = new Set<number>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      if (parent && text.textContent?.trim() && parent.getClientRects().length > 0 && !["SCRIPT", "STYLE"].includes(parent.tagName)) sizes.add(Number.parseFloat(getComputedStyle(parent).fontSize));
    }
    return [...sizes].sort((a, b) => a - b);
  });
}
async function snap(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  // The menus fade in; shoot them once they have settled.
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

// ---- settings ----------------------------------------------------------------------------------------------------------------

test.describe("settings 权限", () => {
  test("loads the saved settings and PUTs the whole body when a preset is chosen (M1, M2)", async ({ page }) => {
    const { calls } = await mockBackend(page, { settings: settingsBody("request", { ...CUSTOM, auto_commands: true }) });
    await openSettings(page);
    await expect(page.getByRole("radiogroup", { name: "新任务默认权限" }).getByRole("radio")).toHaveCount(5);
    await expect(radio(page, /请求批准/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "false");
    await expect(radio(page, /请求批准/)).toContainText("编辑文件和运行命令前都需要你确认。");
    await expect(page.getByRole("switch", { name: "运行命令无需审批" })).toHaveAttribute("aria-checked", "true");

    await radio(page, /帮我批准/).click();
    await expect(radio(page, /帮我批准/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /请求批准/)).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("settings-save-state")).toHaveText("已保存");
    expect(puts(calls, "/v1/settings")).toHaveLength(1);
    expect(puts(calls, "/v1/settings")[0].body).toEqual(settingsBody("auto", { ...CUSTOM, auto_commands: true }));
  });

  test("the default preset is one radio group: a single tab stop, arrows move and select (M2)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await openSettings(page);
    await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /默认权限/)).toHaveAttribute("tabindex", "0");
    await expect(radio(page, /请求批准/)).toHaveAttribute("tabindex", "-1");
    await radio(page, /默认权限/).focus();
    await page.keyboard.press("ArrowDown");
    await expect(radio(page, /请求批准/)).toBeFocused();
    await expect(radio(page, /请求批准/)).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => puts(calls, "/v1/settings").length).toBe(1);
    expect(puts(calls, "/v1/settings")[0].body).toMatchObject({ permissions: { default_preset: "request" } });
  });

  test("choosing 完全访问权限 asks once; cancel changes nothing, confirm saves (M2)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await openSettings(page);
    await expect(radio(page, /完全访问权限/)).toHaveCSS("color", /.+/);
    await radio(page, /完全访问权限/).click();
    const dialog = page.getByRole("dialog", { name: "把完全访问权限设为新任务的默认？" });
    await expect(dialog).toBeVisible();
    await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();
    await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(500);
    expect(puts(calls, "/v1/settings")).toHaveLength(0);

    await radio(page, /完全访问权限/).click();
    await page.getByTestId("full-access-confirm").click();
    await expect(radio(page, /完全访问权限/)).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => puts(calls, "/v1/settings").length).toBe(1);
    expect(puts(calls, "/v1/settings")[0].body).toEqual(settingsBody("full"));
  });

  test("custom rules: 读取 is fixed, 写入 禁止写入 disables 编辑文件, a switch PUTs its rule (M3)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await openSettings(page);
    const read = page.getByRole("radiogroup", { name: "读取权限" });
    await expect(read.getByRole("radio", { name: "仅工作区" })).toBeDisabled();
    await expect(read.getByRole("radio", { name: "仅工作区" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("不提供「所有位置」")).toBeVisible();
    const write = page.getByRole("radiogroup", { name: "写入权限" });
    await expect(write.getByRole("radio", { name: "仅工作区" })).toHaveAttribute("aria-checked", "true");
    const edits = page.getByRole("switch", { name: "编辑文件无需审批" });
    await expect(edits).toBeEnabled();
    await expect(edits).toHaveAttribute("aria-checked", "true");

    await page.getByRole("switch", { name: "运行命令无需审批" }).click();
    await expect.poll(() => puts(calls, "/v1/settings").length).toBe(1);
    expect(puts(calls, "/v1/settings")[0].body).toEqual(settingsBody("default", { ...CUSTOM, auto_commands: true }));

    await write.getByRole("radio", { name: "禁止写入" }).click();
    await expect(write.getByRole("radio", { name: "禁止写入" })).toHaveAttribute("aria-checked", "true");
    await expect(edits).toBeDisabled();
    await expect(edits).toHaveAttribute("aria-checked", "false");
    await expect.poll(() => puts(calls, "/v1/settings").length).toBe(2);
    expect(puts(calls, "/v1/settings")[1].body).toEqual(settingsBody("default", { ...CUSTOM, auto_commands: true, write_scope: "none" }));

    await page.getByRole("switch", { name: "内置能力无需审批" }).click();
    await expect.poll(() => puts(calls, "/v1/settings").length).toBe(3);
    expect(puts(calls, "/v1/settings")[2].body).toMatchObject({ permissions: { custom: { auto_builtin: true, write_scope: "none" } } });
  });

  test("quick edits in a row become one PUT with the last value (M1)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await openSettings(page);
    const commands = page.getByRole("switch", { name: "运行命令无需审批" });
    await commands.click();
    await commands.click();
    await commands.click();
    await expect(page.getByTestId("settings-save-state")).toHaveText("已保存");
    expect(puts(calls, "/v1/settings")).toHaveLength(1);
    expect(puts(calls, "/v1/settings")[0].body).toMatchObject({ permissions: { custom: { auto_commands: true } } });
  });

  test("a failed save puts the old value back and says why (M4)", async ({ page }) => {
    const { calls } = await mockBackend(page, { putFails: 500 });
    await openSettings(page);
    await radio(page, /请求批准/).click();
    await expect(radio(page, /请求批准/)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("保存设置失败，已恢复原来的设置")).toBeVisible();
    await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "true");
    await expect(radio(page, /请求批准/)).toHaveAttribute("aria-checked", "false");
    expect(puts(calls, "/v1/settings")).toHaveLength(1);
  });

  for (const status of [404, 501] as const) {
    test(`a control without the settings route (${status}): defaults, read-only, a quiet note (M5)`, async ({ page }) => {
      const { calls } = await mockBackend(page, { settings: status });
      await openSettings(page);
      await expect(page.getByText("控制面还没有设置接口")).toBeVisible();
      await expect(radio(page, /默认权限/)).toHaveAttribute("aria-checked", "true");
      await expect(radio(page, /请求批准/)).toBeDisabled();
      await expect(page.getByRole("switch", { name: "运行命令无需审批" })).toBeDisabled();
      await expect(page.getByRole("radiogroup", { name: "写入权限" }).getByRole("radio", { name: "禁止写入" })).toBeDisabled();
      // It is a note, not an error: no red alert, and nothing is sent.
      await expect(page.getByText("读取设置失败")).toHaveCount(0);
      expect(puts(calls, "/v1/settings")).toHaveLength(0);
      // The home composer still works against it.
      await page.goto("/");
      await expect(chip(page)).toHaveAttribute("data-preset", "default");
      await expect(chip(page)).toBeEnabled();
    });
  }
});

// ---- the composer ------------------------------------------------------------------------------------------------------------

test.describe("composer permission picker", () => {
  test("home: starts from the user's default, shows the five rows, and POST /v1/tasks carries config.permissions (M6)", async ({ page }) => {
    const { calls } = await mockBackend(page, { settings: settingsBody("auto") });
    await page.goto("/");
    await expect(chip(page)).toHaveAttribute("data-preset", "auto");
    await expect(chip(page)).toContainText("帮我批准");
    await chip(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByText("应如何批准 Agent 操作？", { exact: true })).toBeVisible();
    await expect(menu(page).getByRole("menuitemradio")).toHaveCount(5);
    await expect(menu(page).getByRole("menuitemradio", { name: /帮我批准/ })).toHaveAttribute("aria-checked", "true");
    await expect(menu(page).getByRole("menuitemradio", { name: /默认权限/ })).toContainText("工作区内编辑文件自动通过，运行命令前需要你确认。");
    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);

    await page.getByRole("textbox", { name: "任务目标" }).fill("整理本周发布风险");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect.poll(() => calls.filter((call) => call.path === "/v1/tasks").length).toBe(1);
    expect(calls.find((call) => call.path === "/v1/tasks")!.body).toMatchObject({ config: { permissions: { preset: "auto" } } });
  });

  test("home: a pick of the user's own survives a late settings read; the plain default sends no config (M6)", async ({ page }) => {
    const { calls } = await mockBackend(page, { settings: settingsBody("request"), slowSettings: 600 });
    await page.goto("/");
    await expect(chip(page)).toHaveAttribute("data-preset", "default");
    await chip(page).click();
    await menu(page).getByRole("menuitemradio", { name: /自定义权限/ }).click();
    await expect(chip(page)).toHaveAttribute("data-preset", "custom");
    await expect(chip(page)).toContainText("自定义");
    await page.waitForTimeout(900);
    await expect(chip(page)).toHaveAttribute("data-preset", "custom");
    await page.getByRole("textbox", { name: "任务目标" }).fill("整理本周发布风险");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect.poll(() => calls.filter((call) => call.path === "/v1/tasks").length).toBe(1);
    // Only {preset:"custom"}: control fills the rest from the settings.
    expect(calls.find((call) => call.path === "/v1/tasks")!.body).toMatchObject({ config: { permissions: { preset: "custom" } } });
    expect(JSON.stringify(calls.find((call) => call.path === "/v1/tasks")!.body)).not.toContain("write_scope");
  });

  test("home: with the default left alone, no config goes out (M6)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await page.goto("/");
    await expect(chip(page)).toHaveAttribute("data-preset", "default");
    await page.getByRole("textbox", { name: "任务目标" }).fill("整理本周发布风险");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect.poll(() => calls.filter((call) => call.path === "/v1/tasks").length).toBe(1);
    expect(calls.find((call) => call.path === "/v1/tasks")!.body).not.toHaveProperty("config");
  });

  test("home: 完全访问 asks once per task; cancel keeps the pick; danger colour (M7)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await page.goto("/");
    await chip(page).click();
    const full = menu(page).getByRole("menuitemradio", { name: /完全访问权限/ });
    await full.click();
    const dialog = page.getByRole("dialog", { name: "启用完全访问权限？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    // Cancelling leaves the pick and the menu as they were.
    await expect(chip(page)).toHaveAttribute("data-preset", "default");
    await expect(menu(page)).toBeVisible();
    await full.click();
    await page.getByTestId("full-access-confirm").click();
    await expect(chip(page)).toHaveAttribute("data-preset", "full");
    await expect(chip(page)).toContainText("完全访问");
    const danger = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-danger-700";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(chip(page)).toHaveCSS("color", danger);
    // Back to the default and to full again: already confirmed for this task, no second question.
    await chip(page).click();
    await menu(page).getByRole("menuitemradio", { name: /默认权限/ }).click();
    await chip(page).click();
    await full.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(chip(page)).toHaveAttribute("data-preset", "full");
    await page.getByRole("textbox", { name: "任务目标" }).fill("整理本周发布风险");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect.poll(() => calls.filter((call) => call.path === "/v1/tasks").length).toBe(1);
    expect(calls.find((call) => call.path === "/v1/tasks")!.body).toMatchObject({ config: { permissions: { preset: "full" } } });
  });

  test("in a task: the pick goes through PUT /config with the base version and says 从下一次执行起生效 (M8)", async ({ page }) => {
    const { calls } = await mockBackend(page, { permissions: { preset: "request" } });
    await openTask(page);
    await expect(chip(page)).toHaveAttribute("data-preset", "request");
    await chip(page).click();
    await expect(page.getByTestId("permission-deferred")).toContainText("从下一次执行起生效");
    await menu(page).getByRole("menuitemradio", { name: /帮我批准/ }).click();
    await expect.poll(() => puts(calls, `/v1/tasks/${TASK_ID}/config`).length).toBe(1);
    expect(puts(calls, `/v1/tasks/${TASK_ID}/config`)[0].body).toMatchObject({ base_config_version: 1, permissions: { preset: "auto" }, expert: "writer@1" });
    await expect(page.getByTestId("config-notice")).toContainText("下一次执行起生效");
    await expect(chip(page)).toHaveAttribute("data-preset", "auto");
    // A task whose config has no permissions is the default preset.
  });

  test("in a task: a config with no permissions reads as 默认权限, and 自定义 reads back resolved (M8)", async ({ page }) => {
    await mockBackend(page);
    await openTask(page);
    await expect(chip(page)).toHaveAttribute("data-preset", "default");
    await page.unroute("**/v1/**");
    await mockBackend(page, { permissions: { preset: "custom", ...CUSTOM } });
    await page.reload();
    await expect(chip(page)).toHaveAttribute("data-preset", "custom");
    await expect(chip(page)).toContainText("自定义");
  });

  test("in a task: 完全访问 waits for the confirmation before the PUT (M7, M8)", async ({ page }) => {
    const { calls } = await mockBackend(page);
    await openTask(page);
    await chip(page).click();
    await menu(page).getByRole("menuitemradio", { name: /完全访问权限/ }).click();
    await expect(page.getByRole("dialog", { name: "启用完全访问权限？" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(puts(calls, `/v1/tasks/${TASK_ID}/config`)).toHaveLength(0);
    await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
    expect(puts(calls, `/v1/tasks/${TASK_ID}/config`)).toHaveLength(0);
    await expect(chip(page)).toHaveAttribute("data-preset", "default");
    await menu(page).getByRole("menuitemradio", { name: /完全访问权限/ }).click();
    await page.getByTestId("full-access-confirm").click();
    await expect.poll(() => puts(calls, `/v1/tasks/${TASK_ID}/config`).length).toBe(1);
    expect(puts(calls, `/v1/tasks/${TASK_ID}/config`)[0].body).toMatchObject({ permissions: { preset: "full" } });
    await expect(chip(page)).toHaveAttribute("data-preset", "full");
  });

  test("「/」 offers 权限 and Enter opens the menu (M9)", async ({ page }) => {
    await mockBackend(page);
    await openTask(page);
    await page.getByPlaceholder("向任务发送消息").fill("/");
    await expect(page.getByTestId("slash-menu")).toBeVisible();
    const item = page.locator('[data-testid="slash-item"][data-command="permission"]');
    await expect(item).toContainText("权限");
    await page.getByPlaceholder("向任务发送消息").fill("/权");
    await expect(page.getByTestId("slash-item")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeVisible();
    await expect(page.getByPlaceholder("向任务发送消息")).toHaveValue("");
  });
});

// ---- approvals ---------------------------------------------------------------------------------------------------------------

test.describe("approval risk", () => {
  test("高风险 (danger) and 需要确认 (warning); low and no risk show nothing (M10)", async ({ page }) => {
    await mockBackend(page, { task: { pending_approvals: ["apr_h", "apr_m", "apr_l", "apr_n"] }, events: [...baseEvents(), approval("apr_h", "rm -rf build", "high"), approval("apr_m", "ls -la", "medium"), approval("apr_l", "pwd", "low"), approval("apr_n", "date")] });
    await openTask(page).catch(() => undefined);
    // One card is docked at a time; ‹ › pages through the queue (high, medium, low, none).
    const card = page.getByTestId("approval-item");
    const risk = card.getByTestId("approval-risk");
    const next = page.getByRole("button", { name: "下一件待处理" });
    await expect(card).toHaveAttribute("data-approval-id", "apr_h");
    await expect(risk).toHaveText("高风险");
    await expect(risk).toHaveAttribute("data-risk", "high");
    const tone = await risk.evaluate((el) => getComputedStyle(el).color);
    const dangerText = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "text-danger-700";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(tone).toBe(dangerText);
    await expect(card.getByTestId("approval-title")).toHaveText("运行命令");
    await snap(page, "light-1440x900-approval-risk");
    await next.click();
    await expect(card).toHaveAttribute("data-approval-id", "apr_m");
    await expect(risk).toHaveText("需要确认");
    await expect(risk).toHaveAttribute("data-risk", "medium");
    const warning = await risk.evaluate((el) => getComputedStyle(el).color);
    expect(warning).not.toBe(dangerText);
    await next.click();
    await expect(card).toHaveAttribute("data-approval-id", "apr_l");
    await expect(risk).toHaveCount(0);
    await next.click();
    await expect(card).toHaveAttribute("data-approval-id", "apr_n");
    await expect(risk).toHaveCount(0);
  });
});

// ---- looks: both themes, both widths -----------------------------------------------------------------------------------------

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [
    { name: "1440x900", width: 1440, height: 900 },
    { name: "390x844", width: 390, height: 844 },
  ]) {
    const phone = viewport.width < 640;
    if (phone && theme === "dark") continue;
    test.describe(`${theme} ${viewport.name}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });

      test("settings 权限: nothing clipped, no sideways scroll, six font sizes (M11)", async ({ page }) => {
        await mockBackend(page, { settings: settingsBody("auto"), ...(theme === "dark" ? { theme: "dark" as const } : {}) });
        await openSettings(page);
        if (phone) await expect(page.getByRole("tablist", { name: "设置分组" })).toBeVisible();
        const { scroll, body, inner } = await sideways(page);
        expect(scroll, "documentElement scrolls sideways").toBeLessThanOrEqual(inner);
        expect(body, "body scrolls sideways").toBeLessThanOrEqual(inner);
        // Every control sits inside the screen.
        for (const control of await page.getByRole("radio").all()) {
          const box = (await control.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, "a control is clipped on the right").toBeLessThanOrEqual(viewport.width);
        }
        for (const sw of await page.getByRole("switch").all()) {
          const box = (await sw.boundingBox())!;
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        for (const size of await renderedFontSizes(page)) expect(FONT_SIZES.has(size), `font size ${size}px`).toBe(true);
        if (theme === "dark") expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
        await snap(page, `${theme}-${viewport.name}-settings`);
        if (!phone) {
          await page.evaluate(() => document.querySelector("[data-testid=permissions-section]")?.scrollIntoView());
          await page.getByRole("switch", { name: "内置能力无需审批" }).scrollIntoViewIfNeeded();
          await snap(page, `${theme}-${viewport.name}-settings-custom`);
        }
      });

      test("composer menu: inside the screen, 完全访问 in the danger colour (M11)", async ({ page }) => {
        await mockBackend(page, { permissions: { preset: "request" }, ...(theme === "dark" ? { theme: "dark" as const } : {}) });
        await openTask(page);
        if (phone) {
          const trigger = (await chip(page).boundingBox())!;
          expect(trigger.width, "icon only on a phone-wide composer").toBeLessThanOrEqual(40);
        }
        await chip(page).click();
        const panel = (await menu(page).boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width, "the menu leaves the screen").toBeLessThanOrEqual(viewport.width);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        const { scroll, body, inner } = await sideways(page);
        expect(scroll).toBeLessThanOrEqual(inner);
        expect(body).toBeLessThanOrEqual(inner);
        const title = menu(page).getByRole("menuitemradio", { name: /完全访问权限/ }).locator("span").nth(1);
        const color = await title.evaluate((el) => getComputedStyle(el).color);
        const ordinary = await menu(page).getByRole("menuitemradio", { name: /默认权限/ }).locator("span").nth(1).evaluate((el) => getComputedStyle(el).color);
        expect(color, "the 完全访问 row is not the danger colour").not.toBe(ordinary);
        for (const size of await renderedFontSizes(page)) expect(FONT_SIZES.has(size), `font size ${size}px`).toBe(true);
        await snap(page, `${theme}-${viewport.name}-composer-menu`);
        if (!phone) {
          // The home composer, not only the task's.
          await page.goto("/");
          await chip(page).click();
          await expect(menu(page)).toBeVisible();
          await snap(page, `${theme}-${viewport.name}-home-menu`);
        }
      });
    });
  }
}
