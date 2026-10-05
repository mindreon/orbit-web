/**
 * Acceptance E30 (15 M8, T8.7): the task desk's "+" menu in the browser. What the page lets a person choose is what the
 * task runs with, checked against the backend (the configuration the workflow owns), not only against the page.
 */
import { expect, test } from "@playwright/test";
import { join, resolve } from "node:path";
import { eventually, sql, waitForStatus } from "./tasks";

const INFRA = resolve(process.env.ORBIT_INFRA_DIR ?? join(process.cwd(), ".."));
const PYTHON = join(INFRA, "orbit-runtime", ".venv", "bin", "python");
const MCP_SERVER = join(process.cwd(), "e2e", "stack", "mock_mcp_server.py");
const unique = (label: string) => `${label} ${Date.now()}`;

type ConfigBody = { config_version: number; expert: string | null; skills: string[] | null; connector_ids: string[] | null; mode: string };

test("E30 the + menu sets a task's expert, connectors and mode, and changes them while it runs", async ({ page, request }) => {
  const docsName = unique("e30docs");
  const connectorResponse = await request.post("/v1/mcp-connectors", { data: { name: docsName, command: PYTHON, args: [MCP_SERVER] } });
  expect(connectorResponse.status()).toBe(200);
  const connectorId = (await connectorResponse.json()).id as string;
  const expertName = unique("E30 expert");
  const expertResponse = await request.post("/v1/experts", { data: { name: expertName, instructions: "Be brief." } });
  expect(expertResponse.status()).toBe(201);
  const expertRef = (await expertResponse.json()).ref as string;

  // ---- choose in the menu, then start the task ------------------------------------------------------------------
  await page.goto("/");
  await page.getByTestId("config-add").click();
  const menu = page.getByRole("menu", { name: "添加" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "模式" }).click();
  await page.getByRole("menuitemradio", { name: /仅问答/ }).click();
  // A choice closes the menu: open it again for the next one.
  await page.getByTestId("config-add").click();
  await menu.getByRole("menuitem", { name: "专家" }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(expertName) }).click();
  await page.getByTestId("config-add").click();
  await menu.getByRole("menuitem", { name: "连接器" }).click();
  await page.getByRole("menuitemcheckbox", { name: new RegExp(docsName) }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // What was chosen shows as chips that can be taken off again.
  const chips = page.getByTestId("config-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.filter({ hasText: "仅问答" })).toHaveCount(1);
  await expect(chips.filter({ hasText: expertName })).toHaveCount(1);
  await expect(chips.filter({ hasText: docsName })).toHaveCount(1);

  await page.getByLabel("任务目标").fill("tools:");
  await page.getByRole("button", { name: "开始任务" }).click();
  await page.waitForURL(/\/tasks\/task_/);
  const taskId = page.url().split("/tasks/")[1];

  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const config = (await (await request.get(`/v1/tasks/${taskId}/config`)).json()) as ConfigBody;
  expect(config).toMatchObject({ config_version: 1, expert: expertRef, connector_ids: [connectorId], mode: "ask" });
  // The connector's tool reached the agent, in a read-only session.
  const said = await eventually(async () => sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq DESC LIMIT 1`), (text) => text !== "", "the agent's final message", 30_000);
  expect(said).toContain("docs_lookup");

  // ---- change it while a task runs ------------------------------------------------------------------------------
  await page.goto("/");
  await page.getByLabel("任务目标").fill(`slow:e30-a-${Date.now()}|e30-b-${Date.now()}`);
  await page.getByRole("button", { name: "开始任务" }).click();
  await page.waitForURL(/\/tasks\/task_/);
  const runningId = page.url().split("/tasks/")[1];
  await eventually(async () => (await (await request.get(`/v1/tasks/${runningId}/config`)).json()) as ConfigBody, (c) => c.config_version === 1, "the task's configuration", 30_000);

  await page.getByTestId("config-add").click();
  await page.getByRole("menuitem", { name: "连接器" }).click();
  await page.getByRole("menuitemcheckbox", { name: new RegExp(docsName) }).click();
  await expect(page.getByTestId("config-notice")).toContainText("第 2 版");
  await expect(page.getByTestId("config-notice")).toContainText("下一次执行");
  expect((await (await request.get(`/v1/tasks/${runningId}/config`)).json()) as ConfigBody).toMatchObject({ config_version: 2, connector_ids: [connectorId] });
  // The attempt that is running began without it and keeps it that way.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${runningId}' AND event_type = 'attempt.started'`)).toBe("1");

  // Taking the chip off again is a change too: an empty list, not "no change".
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: `移除 ${docsName}` }).click();
  await expect(page.getByTestId("config-notice")).toContainText("第 3 版");
  expect((await (await request.get(`/v1/tasks/${runningId}/config`)).json()) as ConfigBody).toMatchObject({ config_version: 3, connector_ids: [] });
});

// ---- E31: the parts of the desk E30 does not touch ---------------------------------------------------------------
// The catalog fixture of up.mjs holds this skill's text; its name and description are read from the catalog itself.
const FIXTURE_SKILL = { handle: "@0froq", slug: "nuxt" };

async function fixtureSkill(request: import("@playwright/test").APIRequestContext) {
  await eventually(
    async () => (await (await request.get(`/v1/skill-files/${FIXTURE_SKILL.handle}/${FIXTURE_SKILL.slug}`)).json()) as { items?: unknown[] },
    (body) => (body.items ?? []).length === 2,
    "the fixture skill's text in the catalog",
    120_000,
  );
  // The library answers at once; the catalog's names and descriptions are copied in by control in the background.
  return eventually(
    async () => (await (await request.get(`/v1/skills/${FIXTURE_SKILL.handle}/${FIXTURE_SKILL.slug}`)).json()) as { id?: string; name: string; description: string },
    (found) => typeof found.id === "string",
    "the fixture skill in the catalog",
    120_000,
  ) as Promise<{ id: string; name: string; description: string }>;
}

test("E31 the skill panel, the expert editor, the list of my experts and a stale configuration, in the browser", async ({ page, request }) => {
  const skill = await fixtureSkill(request);
  // The list shows titles only, and several skills share one; the row carries the id it stands for.
  const skillOption = () => page.locator(`[data-option-id="${skill.id}"]`);

  // ---- the skill panel of the + menu: search, choose, take off ---------------------------------------------------
  await page.goto("/");
  await page.getByTestId("config-add").click();
  await page.getByRole("menuitem", { name: "技能" }).click();
  await page.getByLabel("搜索技能").fill(skill.description.slice(0, 20));
  await skillOption().click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("config-chip").filter({ hasText: skill.name })).toHaveCount(1);
  await page.getByLabel("任务目标").fill("prompt:");
  await page.getByRole("button", { name: "开始任务" }).click();
  await page.waitForURL(/\/tasks\/task_/);
  const skilledId = page.url().split("/tasks/")[1];
  await waitForStatus(request, skilledId, "COMPLETED", 90_000);
  expect(((await (await request.get(`/v1/tasks/${skilledId}/config`)).json()) as ConfigBody).skills).toEqual([skill.id]);
  const prompt = sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${skilledId}' AND event_type = 'message.agent_final' ORDER BY seq DESC LIMIT 1`);
  expect(prompt).toContain("<name>E2E Pirate</name>");

  // ---- the expert editor: create, see it listed, edit it into a second version ---------------------------------
  const connectorName = unique("e31docs");
  const connector = await request.post("/v1/mcp-connectors", { data: { name: connectorName, command: PYTHON, args: [MCP_SERVER] } });
  const connectorId = (await connector.json()).id as string;
  const expertName = unique("E31 expert");
  await page.goto("/experts/new");
  await page.getByLabel("名称", { exact: true }).fill(expertName);
  await page.getByLabel("指令").fill("Be formal.");
  await page.getByRole("checkbox", { name: connectorName }).check();
  await page.getByLabel("搜索技能").fill(skill.description.slice(0, 20));
  await skillOption().click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/experts\/agents$/);
  const mine = page.getByTestId("my-expert").filter({ hasText: expertName });
  await expect(mine).toHaveCount(1);
  // The list shows the name, not the version: that is on the edit page.
  await expect(mine).not.toContainText(/\bv\d+\b/);
  const created = ((await (await request.get("/v1/experts")).json()) as { items: Array<{ expert_id: string; ref: string; name: string; skill_ids: string[]; connector_ids: string[] }> }).items.find((item) => item.name === expertName)!;
  expect(created.skill_ids).toEqual([skill.id]);
  expect(created.connector_ids).toEqual([connectorId]);

  await mine.getByRole("link", { name: "编辑" }).click();
  await page.waitForURL(/\/experts\/.+\/edit$/);
  await expect(page.getByLabel("指令")).toHaveValue("Be formal.");
  await page.getByLabel("指令").fill("Be casual.");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForURL(/\/experts\/agents$/);
  // A new version replaces the old one in the list (still one card, no version number shown); the API holds version 2.
  await expect(page.getByTestId("my-expert").filter({ hasText: expertName })).toContainText("Be casual.");
  expect(((await (await request.get("/v1/experts")).json()) as { items: Array<{ name: string; version: number }> }).items.find((item) => item.name === expertName)?.version).toBe(2);
  // Version 1 is exactly what it was; a task naming it still runs that configuration.
  const v1 = (await (await request.get(`/v1/profiles/${created.ref}`)).json()) as { spec: { instructions: string } };
  expect(v1.spec.instructions).toBe("Be formal.");

  // ---- a stale configuration: someone else changed it, the page says so and reloads -----------------------------
  await page.goto("/");
  await page.getByLabel("任务目标").fill(`slow:e31-a-${Date.now()}|e31-b-${Date.now()}`);
  await page.getByRole("button", { name: "开始任务" }).click();
  await page.waitForURL(/\/tasks\/task_/);
  const heldId = page.url().split("/tasks/")[1];
  await eventually(async () => (await (await request.get(`/v1/tasks/${heldId}/config`)).json()) as ConfigBody, (c) => c.config_version === 1, "the task's configuration", 30_000);
  // The page has read version 1 once the menu is usable; only then is a change behind its back a stale one.
  await expect(page.getByTestId("config-add")).toBeEnabled();
  expect((await request.put(`/v1/tasks/${heldId}/config`, { data: { base_config_version: 1, mode: "plan" } })).status()).toBe(200);
  await page.getByTestId("config-add").click();
  await page.getByRole("menuitem", { name: "连接器" }).click();
  await page.getByRole("menuitemcheckbox", { name: new RegExp(connectorName) }).click();
  await expect(page.getByRole("alert").filter({ hasText: "刚被改过" })).toBeVisible();
  // Nothing of the stale choice was kept: the configuration is the one the other change made.
  expect((await (await request.get(`/v1/tasks/${heldId}/config`)).json()) as ConfigBody).toMatchObject({ config_version: 2, mode: "plan", connector_ids: null });
});

test("E32 a catalog agent becomes an expert, and an old assistant is merged in once", async ({ page, request }) => {
  // The agent's prompts become the instructions; what it names that the tenant lacks is reported, not guessed.
  const handle = "@AgentscopeAI";
  const slug = "AuditableGrowthEquityAnalyst";
  await page.goto(`/experts/agents/${encodeURIComponent(handle)}/${slug}`);
  await page.getByRole("button", { name: "使用这位专家" }).click();
  await page.waitForURL(/\/experts\/.+\/edit$/);
  await expect(page.getByLabel("名称", { exact: true })).not.toHaveValue("");
  const instructions = await page.getByLabel("指令").inputValue();
  expect(instructions.length).toBeGreaterThan(20);
  const adopted = ((await (await request.get("/v1/experts")).json()) as { items: Array<{ ref: string; source?: string }> }).items.find((item) => item.source === `agent:${handle}/${slug}`);
  expect(adopted, "the adopted expert is listed with its source").toBeTruthy();

  const unknown = await request.post("/v1/experts/from-agent", { data: { handle: "@nobody", slug: "none" } });
  expect(unknown.status()).toBe(404);

  // A task that names the adopted expert runs with those instructions.
  const taskId = (await (await request.post("/v1/tasks", { data: { title: unique("E32"), goal: "prompt:", config: { expert: adopted!.ref } } })).json()).task_id as string;
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const said = sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq DESC LIMIT 1`);
  expect(said).toContain(instructions.slice(0, 20));

  // An assistant of the tenant (the old name for it) is merged in once; a connector it lists that is gone is left out.
  const connector = await request.post("/v1/mcp-connectors", { data: { name: unique("e32docs"), command: PYTHON, args: [MCP_SERVER] } });
  const connectorId = (await connector.json()).id as string;
  const personaName = unique("E32 assistant");
  const persona = await request.post("/v1/personas", { data: { name: personaName, instructions: "Old style.", mcpConnectorIds: [connectorId, "mcp_gone"] } });
  expect(persona.ok()).toBeTruthy();
  const first = (await (await request.post("/v1/experts/import-personas")).json()) as { imported: number; skipped: number };
  expect(first.imported).toBeGreaterThanOrEqual(1);
  const merged = ((await (await request.get("/v1/experts")).json()) as { items: Array<{ name: string; connector_ids: string[]; instructions: string; source?: string }> }).items.find((item) => item.name === personaName)!;
  expect(merged.instructions).toBe("Old style.");
  expect(merged.connector_ids).toEqual([connectorId]);
  expect(merged.source).toMatch(/^persona:/);
  const again = (await (await request.post("/v1/experts/import-personas")).json()) as { imported: number; skipped: number };
  expect(again.imported).toBe(0);
  expect(again.skipped).toBeGreaterThanOrEqual(first.imported);
});
