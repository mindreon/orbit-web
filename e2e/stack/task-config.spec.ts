/**
 * Acceptance E24-E27 (15 M8): what a task runs with. An expert's instructions and a task's connectors reach the agent,
 * a change applies from the next attempt and never to the one that is running, and it survives a worker restart.
 *
 * The mock model shows what the agent was given: `prompt:` answers with its system prompt, `tools:` with the names of
 * its tools, and `mcp:<tool>|<json>` calls one. The connector is a real stdio MCP server (mock_mcp_server.py) that the
 * worker starts, so a tool that appears here came through the whole path: control, the workflow, the activity, MCP.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eventually, killWorker, sql, waitForStatus } from "./tasks";

const INFRA = resolve(process.env.ORBIT_INFRA_DIR ?? join(process.cwd(), ".."));
const PYTHON = join(INFRA, "orbit-runtime", ".venv", "bin", "python");
const MCP_SERVER = join(process.cwd(), "e2e", "stack", "mock_mcp_server.py");
const unique = (label: string) => `${label} ${Date.now()}`;

type Config = { expert?: string; skills?: string[] | null; connector_ids?: string[] | null; mode?: string };

async function connector(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post("/v1/mcp-connectors", { data: { name, command: PYTHON, args: [MCP_SERVER] } });
  expect(response.status()).toBe(200);
  return (await response.json()).id as string;
}

async function expert(request: APIRequestContext, body: Record<string, unknown>): Promise<{ expert_id: string; ref: string }> {
  const response = await request.post("/v1/experts", { data: body });
  expect(response.status()).toBe(201);
  return response.json();
}

async function task(request: APIRequestContext, title: string, goal: string, config?: Config): Promise<string> {
  const response = await request.post("/v1/tasks", { data: { title, goal, ...(config ? { config } : {}) }, timeout: 120_000 });
  expect(response.status()).toBe(201);
  return (await response.json()).task_id as string;
}

/** What the agent said last, from the durable event. */
const finalText = (taskId: string) =>
  eventually(async () => sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq DESC LIMIT 1`), (text) => text !== "", "the agent's final message", 60_000);

/** An MCP tool is a custom tool: a person has to allow its call (the same gate as any tool that is not read-only). */
async function approvePending(request: APIRequestContext, taskId: string): Promise<void> {
  const task = await eventually(async () => (await (await request.get(`/v1/tasks/${taskId}`)).json()) as { pending_approvals?: string[] }, (t) => (t.pending_approvals ?? []).length > 0, "the call to wait for approval", 60_000);
  const response = await request.post(`/v1/tasks/${taskId}/approvals/${task.pending_approvals![0]}`, { data: { decision: "approve" } });
  expect(response.status()).toBe(202);
}

const readConfig = async (request: APIRequestContext, taskId: string) => (await request.get(`/v1/tasks/${taskId}/config`)).json();

test("E24 an expert's instructions reach the agent, and a task without one does not get them", async ({ request }) => {
  const mark = `Always answer like a pirate ${Date.now()}.`;
  const { ref } = await expert(request, { name: unique("E24 expert"), instructions: mark });

  const withExpert = await task(request, unique("E24 expert"), "prompt:", { expert: ref });
  await waitForStatus(request, withExpert, "COMPLETED", 90_000);
  expect(await finalText(withExpert)).toContain(mark);
  // The task is bound to that exact version, in the task row and in its configuration.
  expect(((await (await request.get(`/v1/tasks/${withExpert}`)).json()) as { profile: string }).profile).toBe(ref);
  expect((await readConfig(request, withExpert)).expert).toBe(ref);

  const plain = await task(request, unique("E24 plain"), "prompt:");
  await waitForStatus(request, plain, "COMPLETED", 90_000);
  expect(await finalText(plain)).not.toContain(mark);
});

test("E24 the nodes an expert plans run as that expert, not as the default agent", async ({ request }) => {
  const mark = `Always answer like a poet ${Date.now()}.`;
  const { ref } = await expert(request, { name: unique("E24 planner"), instructions: mark });
  // The exploration node plans two nodes; each one's goal makes the mock answer with the prompt it was given.
  const taskId = await task(request, unique("E24 plan"), "plan:prompt:|prompt:", { expert: ref });
  await waitForStatus(request, taskId, "COMPLETED", 120_000);
  const finals = sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq`).split("\n=END=\n");
  const prompts = sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' AND body->'payload'->>'text' LIKE 'prompt=%'`);
  expect(prompts).toBe("2");
  const withMark = sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' AND body->'payload'->>'text' LIKE 'prompt=%' AND body->'payload'->>'text' LIKE '%${mark}%'`);
  expect(withMark, `both planned nodes carry the expert's instructions; finals: ${finals.length}`).toBe("2");
});

test("E25 connectors reach the agent as real tools and go through the policy; refused references create nothing", async ({ request }) => {
  const docs = await connector(request, unique("e25docs"));
  const called = `e25-${Date.now()}`;

  const without = await task(request, unique("E25 none"), "tools:");
  await waitForStatus(request, without, "COMPLETED", 90_000);
  expect(await finalText(without)).not.toContain("docs_lookup");

  const withConnector = await task(request, unique("E25 tool list"), "tools:", { connector_ids: [docs] });
  await waitForStatus(request, withConnector, "COMPLETED", 90_000);
  // An MCP tool is named after its connector, and that full name is what a policy and a call have to use.
  const toolName = (await finalText(withConnector)).replace("tools=", "").split(",").find((name) => name.endsWith("docs_lookup"));
  expect(toolName, "the connector's tool is in the agent's toolkit").toBeTruthy();

  const used = await task(request, unique("E25 call"), `mcp:${toolName}|${JSON.stringify({ query: called })}`, { connector_ids: [docs] });
  await approvePending(request, used);
  await waitForStatus(request, used, "COMPLETED", 90_000);
  expect(await finalText(used)).toContain(`docs:${called}`);
  expect(sql(`SELECT string_agg(body->'payload'->>'state', ',') FROM task_events WHERE task_id = '${used}' AND event_type = 'tool.call_finished'`)).toBe("success");

  // The task's own policy still applies to a tool a connector brought.
  const denied = await request.post("/v1/tasks", {
    data: { title: unique("E25 denied"), goal: `mcp:${toolName}|${JSON.stringify({ query: called })}`, policy: { denied_tools: [toolName] }, config: { connector_ids: [docs] } },
  });
  expect(denied.status()).toBe(201);
  const deniedId = (await denied.json()).task_id as string;
  await waitForStatus(request, deniedId, "COMPLETED", 90_000);
  expect(sql(`SELECT string_agg(body->'payload'->>'state', ',') FROM task_events WHERE task_id = '${deniedId}' AND event_type = 'tool.call_finished'`)).toBe("denied");

  // A reference that is not the tenant's is refused before any task exists.
  const before = (await (await request.get("/v1/tasks")).json()).items.length;
  for (const bad of [{ connector_ids: ["mcp_not-there"] }, { expert: "nobody@1" }, { skills: ["nobody/none"] }, { mode: "yolo" }]) {
    const refused = await request.post("/v1/tasks", { data: { title: "refused", goal: "x", config: bad } });
    expect(refused.status(), JSON.stringify(bad)).toBe(400);
  }
  expect((await (await request.get("/v1/tasks")).json()).items.length).toBe(before);
});

test("E26 a changed configuration applies from the next attempt, never to the running one; stale and closed updates are refused", async ({ request }) => {
  const docs = await connector(request, unique("e26docs"));
  // Two held tool calls keep the first attempt running for seconds (as in E4).
  const taskId = await task(request, unique("E26"), `slow:e26-a-${Date.now()}|e26-b-${Date.now()}`);
  await eventually(() => readConfig(request, taskId), (cfg) => cfg.config_version === 1, "the task's configuration");
  expect(await readConfig(request, taskId)).toMatchObject({ config_version: 1, expert: null, connector_ids: null, mode: "default" });

  const put = (body: Record<string, unknown>) => request.put(`/v1/tasks/${taskId}/config`, { data: body });
  const changed = await put({ base_config_version: 1, connector_ids: [docs], mode: "default" });
  expect(changed.status()).toBe(200);
  expect(await changed.json()).toMatchObject({ config_version: 2, effective: "next_attempt" });
  expect(await readConfig(request, taskId)).toMatchObject({ config_version: 2, connector_ids: [docs] });

  // Built on the version it replaced: refused by the workflow, and nothing changes.
  const stale = await put({ base_config_version: 1, mode: "ask" });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error?.code ?? (await stale.text())).toContain("CONFIG_VERSION_CONFLICT");
  expect((await readConfig(request, taskId)).mode).toBe("default");

  // The durable event names the connector by id and never carries its launch target.
  const changedEvent = await eventually(
    async () => sql(`SELECT body->'payload' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'task.config_changed'`),
    (row) => row !== "", "task.config_changed", 30_000,
  );
  expect(changedEvent).toContain(docs);
  expect(changedEvent).not.toContain(MCP_SERVER);

  // The attempt that is running began without the connector and keeps it that way; the interrupt starts attempt 2.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("1");
  const sent = await request.post(`/v1/tasks/${taskId}/messages`, { data: { text: "tools:", delivery: "interrupt" } });
  expect(sent.ok()).toBeTruthy();
  await waitForStatus(request, taskId, "COMPLETED", 120_000);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("2");
  expect(await finalText(taskId)).toContain("docs_lookup");

  // A closed task takes no configuration.
  const closed = await put({ base_config_version: 2, mode: "ask" });
  expect(closed.status()).toBe(409);
  expect(await closed.text()).toContain("TASK_CLOSED");
});

test("E27 the configuration survives a worker restart and the next attempt still has it", async ({ request }) => {
  const docs = await connector(request, unique("e27docs"));
  // Two chained nodes. The first asks a question and waits for the answer, so nothing is running while the worker
  // restarts (recovering an activity is E6's subject). A message to a waiting attempt is its answer and the same
  // attempt goes on, so the configuration reaches the second node's attempt, which is a new one.
  const taskId = await task(request, unique("E27"), `plan:ask:E27 ${Date.now()}, which docs?|tools:`);
  await waitForStatus(request, taskId, "WAITING", 60_000);
  expect((await request.put(`/v1/tasks/${taskId}/config`, { data: { base_config_version: 1, connector_ids: [docs], mode: "default" } })).status()).toBe(200);
  // The workflow publishes its events through an activity on the worker. Killing the worker while that activity is in
  // flight stalls the workflow until the activity times out (two minutes), which is a different test (E6, E8); wait
  // for the event to land so that the restart finds the worker idle.
  await eventually(async () => sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'task.config_changed'`), (n) => n === "1", "task.config_changed", 30_000);

  await killWorker(request);
  // The workflow owns the configuration, so the worker's death changes nothing about it.
  expect(await readConfig(request, taskId)).toMatchObject({ config_version: 2, connector_ids: [docs] });

  const answered = await request.post(`/v1/tasks/${taskId}/messages`, { data: { text: "the e27 docs" } });
  expect(answered.ok()).toBeTruthy();
  try {
    await waitForStatus(request, taskId, "COMPLETED", 90_000);
  } catch (error) {
    const events = sql(`SELECT seq || ' ' || event_type FROM task_events WHERE task_id = '${taskId}' ORDER BY seq`);
    throw new Error(`${error}\nthe task's events:\n${events}`, { cause: error });
  }
  // Exploration, the question, the tool listing: the last one began after the change and has the connector.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("3");
  expect(await finalText(taskId)).toContain("docs_lookup");
});

// The skills the catalog fixture of up.mjs holds: one with a SKILL.md, one without, one with no text at all.
const SKILL = { usable: "@0froq/nuxt", noSkillMd: "@0froq/pinia", noText: "@0froq/unocss", mark: "e2e-skill-mark" };

/** The prompt the agent was given for one task. */
async function promptOf(request: APIRequestContext, config?: Config): Promise<string> {
  const taskId = await task(request, unique("E28 prompt"), "prompt:", config);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  return finalText(taskId);
}

test("E28 skills reach the agent as readable data, an expert's defaults can be kept or cleared, and nothing is left behind", async ({ request }) => {
  // The catalog installs in the background at control's start; its text comes from the fixture sidecar.
  await eventually(
    async () => (await (await request.get(`/v1/skill-files/${SKILL.usable}`)).json()) as { items?: unknown[] },
    (body) => (body.items ?? []).length === 2,
    "the fixture skill's text in the catalog",
    120_000,
  );

  // A skill the worker could not use is refused when it is chosen, before any task or expert exists.
  const before = (await (await request.get("/v1/tasks")).json()).items.length;
  for (const skill of [SKILL.noSkillMd, SKILL.noText, "nobody/none"]) {
    const refused = await request.post("/v1/tasks", { data: { title: "refused", goal: "x", config: { skills: [skill] } } });
    expect(refused.status(), skill).toBe(400);
    const expertRefused = await request.post("/v1/experts", { data: { name: "refused", skill_ids: [skill] } });
    expect(expertRefused.status(), skill).toBe(400);
  }
  expect((await (await request.get("/v1/tasks")).json()).items.length).toBe(before);

  // Chosen on the task: the agent is told the skill's name, description and place, and gets a tool to read it.
  const withSkill = await promptOf(request, { skills: [SKILL.usable] });
  expect(withSkill).toContain("<name>E2E Pirate</name>");
  expect(withSkill).toContain(SKILL.mark);
  expect(await promptOf(request)).not.toContain("E2E Pirate");
  const tools = await task(request, unique("E28 tools"), "tools:", { skills: [SKILL.usable] });
  await waitForStatus(request, tools, "COMPLETED", 90_000);
  expect((await finalText(tools)).replace("tools=", "").split(",")).toContain("Skill");

  // An expert brings skills by default: a task that only names the expert has them, one that sets none does not.
  const bringing = await expert(request, { name: unique("E28 expert"), skill_ids: [SKILL.usable] });
  expect(await promptOf(request, { expert: bringing.ref })).toContain("E2E Pirate");
  expect(await promptOf(request, { expert: bringing.ref, skills: [] })).not.toContain("E2E Pirate");
  expect(await promptOf(request, { expert: bringing.ref, skills: null })).toContain("E2E Pirate");

  // The staged files exist for one attempt only.
  const left = () => readdirSync(tmpdir()).filter((name) => name.startsWith("orbit-skills-"));
  await eventually(async () => left().length, (count) => count === 0, "the staged skill directories to be removed", 30_000);
});
