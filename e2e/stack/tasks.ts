/** Helpers for the v3 task acceptance E2E (E1–E7) against the running stack (see up.mjs). */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

const STACK_ROOT = process.env.ORBIT_STACK_DIR ?? join(process.env.ORBIT_INFRA_DIR ?? join(process.cwd(), ".."), ".stack");
const RELAY_ADMIN = "http://127.0.0.1:18183";
const PG_CONTAINER = "orbit-stack-pg";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** What a node is inside a compiled SOP (contract v3 `sop_step`). */
export type SopStepInfo = { sop: string; role: "sop" | "step" | "approval_before" | "approval_after"; total: number; step_id: string; index: number; subject: string };
export type Node = { node_id: string; type: string; title: string; status: string; attempt_count: number; frozen: boolean; current_attempt_id?: string; parent_node_id?: string | null; sop_step?: SopStepInfo | null };
export type PlanView = { plan_version: number; nodes: Node[] };
export type TaskView = { task_id: string; status: string; plan_version: number; pending_approvals: string[] | null };

/** `poll` until `predicate(value)` holds; the projection can lag the workflow by a few rounds. */
export async function eventually<T>(read: () => Promise<T>, predicate: (value: T) => boolean, what: string, timeout = 60_000): Promise<T> {
  const deadline = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (predicate(last)) return last;
    } catch {
      // not there yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${what}; last value: ${JSON.stringify(last)}`);
}

export type Policy = { denied_tools?: string[]; exploration_max_tool_calls?: number };

export async function createTask(request: APIRequestContext, title: string, goal: string, profile?: string, policy?: Policy): Promise<string> {
  const response = await request.post("/v1/tasks", { data: { title, goal, ...(profile ? { profile } : {}), ...(policy ? { policy } : {}) }, timeout: 120_000 });
  expect(response.status()).toBe(201);
  return (await response.json()).task_id as string;
}

/** Sets the tenant-wide policy, the outermost layer; returns what to put back afterwards. */
export async function setTenantPolicy(request: APIRequestContext, policy: Policy): Promise<Policy> {
  const before = (await (await request.get("/v1/policy")).json()) as Policy;
  expect((await request.put("/v1/policy", { data: policy })).status()).toBe(200);
  return before;
}

/** Registers an immutable agent profile version and returns its ref. */
export async function registerProfile(request: APIRequestContext, profileId: string, version: number, spec: Record<string, unknown>): Promise<string> {
  const response = await request.post("/v1/profiles", { data: { profile_id: profileId, version, spec } });
  expect(response.status()).toBe(201);
  return (await response.json()).ref as string;
}

/** Registers an immutable SOP version (the same id, version and steps again is a no-op). */
export type SopStep = string | { subject: string; description?: string; max_attempts?: number };
export async function registerSop(request: APIRequestContext, sopId: string, version: number, steps: readonly SopStep[]): Promise<string> {
  const response = await request.post("/v1/sops", { data: { sop_id: sopId, version, steps } });
  expect(response.status()).toBe(201);
  return (await response.json()).ref as string;
}

export const getTask = async (request: APIRequestContext, taskId: string): Promise<TaskView> => (await request.get(`/v1/tasks/${taskId}`)).json();
export const getPlan = async (request: APIRequestContext, taskId: string): Promise<PlanView> => (await request.get(`/v1/tasks/${taskId}/plan`)).json();

export const waitForStatus = (request: APIRequestContext, taskId: string, status: string, timeout?: number) =>
  eventually(() => getTask(request, taskId), (task) => task.status === status, `task ${taskId} to be ${status}`, timeout);

const ulid = () => "01" + Array.from({ length: 24 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join("");

/** What a node has to show before it is frozen (04 §5). */
export type CompletionContract = {
  required_artifacts?: Array<{ name: string; media_type: string; min_count?: number }>;
  verifications?: Array<{ kind: "command" | "schema" | "human" | "sop_verifier"; spec?: Record<string, unknown> }>;
};

type NodeDraft = ({ type: "agent_turn"; title: string; goal: string } | { type: "sop_stage"; title: string; sop: string } | { type: "approval"; title: string; summary: string }) & {
  workspace_access?: "write" | "read" | "none";
  completion_contract?: CompletionContract;
};

/**
 * Commits one plan change that adds `drafts` as a chain after the exploration node (as a user plan change; the
 * agent-side planning tool is a later task).
 */
export async function addNodes(request: APIRequestContext, taskId: string, drafts: readonly NodeDraft[]): Promise<void> {
  const plan = await eventually(() => getPlan(request, taskId), (p) => p.plan_version >= 1, "the initial plan");
  const ops = drafts.map((draft, index) => ({
    op: "add_node",
    node: {
      node_id: `tmp:${index + 1}`,
      type: draft.type,
      title: draft.title,
      owner_profile: "default@1",
      depends_on: [index === 0 ? plan.nodes[0].node_id : `tmp:${index}`],
      spec: draft.type === "sop_stage" ? { sop: draft.sop } : draft.type === "approval" ? { summary: draft.summary, risk: "medium" } : { goal: draft.goal },
      ...(draft.workspace_access ? { workspace_access: draft.workspace_access } : {}),
      ...(draft.completion_contract ? { completion_contract: draft.completion_contract } : {}),
    },
  }));
  const response = await request.post(`/v1/tasks/${taskId}/plan`, {
    data: { schema_version: "orbit.plan_change/1", command_id: ulid(), task_id: taskId, base_plan_version: plan.plan_version, actor: { kind: "user", id: "local-user" }, ops },
    timeout: 120_000,
  });
  expect(response.status()).toBe(202);
  await eventually(() => getPlan(request, taskId), (p) => p.plan_version === plan.plan_version + 1, "the plan change to commit");
}

/** SIGKILLs the worker and brings a new one up after `downMs` (A3/A4: kill -9). */
export async function killWorker(request: APIRequestContext, downMs = 500): Promise<void> {
  const response = await request.post(`${RELAY_ADMIN}/worker/restart?downMs=${downMs}`, { timeout: 90_000 });
  expect(response.ok()).toBeTruthy();
}

/** SIGKILLs orbit-control and starts a new one after `downMs` (A15). */
export async function killControl(request: APIRequestContext, downMs = 1_500): Promise<void> {
  expect((await request.post(`${RELAY_ADMIN}/control/restart?downMs=${downMs}`, { timeout: 90_000 })).ok()).toBeTruthy();
}

/** Cuts the browser's connection to control for `holdMs`, like a network outage. */
export async function networkOutage(request: APIRequestContext, holdMs: number): Promise<void> {
  expect((await request.post(`${RELAY_ADMIN}/drop?holdMs=${holdMs}`)).ok()).toBeTruthy();
}

/** A backend fact straight from the task tables (as the superuser, so RLS does not hide rows). */
export function sql(query: string): string {
  return execFileSync("docker", ["exec", PG_CONTAINER, "psql", "-U", "postgres", "-d", "orbit_control", "-tA", "-c", query], { encoding: "utf8" }).trim();
}

/** How many times the mock `slow_echo` tool really ran for `text` (it logs a line as each run starts). */
export const toolRuns = (text: string): number =>
  readFileSync(join(STACK_ROOT, "tool-runs.log"), "utf8").split("\n").filter((line) => line === `slow_echo:${text}`).length;

/** Attempt ids of one task, oldest first. */
export const attemptIds = (taskId: string): string[] =>
  sql(`SELECT body->'payload'->>'attempt_id' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started' ORDER BY seq`).split("\n").filter(Boolean);

/** Running AttemptWorkflows of one task, from Temporal itself. */
export function runningAttemptWorkflows(taskId: string): number {
  const out = execFileSync(join(STACK_ROOT, "bin", "temporal"), [
    "workflow", "list", "--address", "127.0.0.1:17233", "--output", "json",
    "--query", `WorkflowType = "AttemptWorkflow" AND ExecutionStatus = "Running" AND WorkflowId STARTS_WITH "attempt/${taskId}/"`,
  ], { encoding: "utf8" }).trim();
  return out ? (JSON.parse(out) as unknown[]).length : 0;
}

/** Opens the task desk on one task. */
export async function openTask(page: Page, title: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

export const taskStatus = (page: Page) => page.getByTestId("task-status");
export const attemptRows = (page: Page) => page.getByTestId("attempt-row");
export const planNodes = (page: Page) => page.getByTestId("plan-node");
/** The nodes a SOP was compiled into, listed under the SOP node in the plan. */
export const planSteps = (page: Page) => page.getByTestId("plan-step");

/** The compiled SOP steps of a task (not its approvals), in plan order, as the API reports them. */
export const sopSteps = async (request: APIRequestContext, taskId: string): Promise<Node[]> => (await getPlan(request, taskId)).nodes.filter((node) => node.sop_step?.role === "step");

/** How many times each node of the task was started, by node id (durable events, so it counts attempts that crashed too). */
export const startsByNode = (taskId: string): Record<string, number> =>
  Object.fromEntries(
    sql(`SELECT body->'payload'->>'node_id' || '=' || count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started' GROUP BY body->'payload'->>'node_id'`)
      .split("\n")
      .filter(Boolean)
      .map((row) => [row.split("=")[0], Number(row.split("=")[1])]),
  );
export const eventRows = (page: Page) => page.getByTestId("event-row");

export type StreamedEvent = { seq: number; type: string; payload: Record<string, unknown> };

/**
 * Follows a task's event stream like a browser's EventSource does: when the stream drops it reconnects with the last
 * durable id, and it stops at `task.completed`. `events` fills as frames arrive.
 */
export function followTask(taskId: string, base = "http://127.0.0.1:3410") {
  const events: StreamedEvent[] = [];
  let lastId = "";
  let stopped = false;
  const finished = () => events.some((event) => event.type === "task.completed");
  const done = (async () => {
    while (!stopped && !finished()) {
      try {
        const response = await fetch(`${base}/v1/tasks/${taskId}/events`, {
          headers: { accept: "text/event-stream", ...(lastId ? { "last-event-id": lastId } : {}) },
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done: closed } = await reader.read();
          if (closed) break;
          buffer += decoder.decode(value, { stream: true });
          for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const id = /^id: (\d+)$/m.exec(frame)?.[1];
            const data = /^data: (.*)$/m.exec(frame)?.[1];
            if (id) lastId = id;
            if (data) events.push(JSON.parse(data) as StreamedEvent);
          }
          if (finished() || stopped) {
            await reader.cancel();
            break;
          }
        }
      } catch {
        // the replica went away: reconnect below
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  })();
  return { events, done, stop: () => { stopped = true; } };
}

/** Takes a control replica out of the cluster (A30 scale-down), or brings it back. */
export async function setControlReplica(request: APIRequestContext, index: number, action: "stop" | "start"): Promise<void> {
  expect((await request.post(`${RELAY_ADMIN}/control/replica?index=${index}&action=${action}`, { timeout: 90_000 })).ok()).toBeTruthy();
}

/** Which Worker Deployment build a workflow runs on and how it is versioned (T2.6), straight from Temporal. */
export function workflowVersion(workflowId: string): { behavior: string; buildId: string } {
  const out = execFileSync(join(STACK_ROOT, "bin", "temporal"), [
    "workflow", "describe", "--workflow-id", workflowId, "--address", "127.0.0.1:17233", "--output", "json",
  ], { encoding: "utf8" });
  const info = JSON.parse(out).workflowExecutionInfo.versioningInfo ?? {};
  return { behavior: String(info.behavior ?? ""), buildId: String(info.deploymentVersion?.buildId ?? "") };
}

/** Releases a new build next to the running one and makes it current; rolls back to v1 and retires it later. */
export async function release(request: APIRequestContext, build: string): Promise<void> {
  expect((await request.post(`${RELAY_ADMIN}/deploy/release?build=${build}`, { timeout: 120_000 })).ok()).toBeTruthy();
}
export async function rollBack(request: APIRequestContext, retire: string): Promise<void> {
  expect((await request.post(`${RELAY_ADMIN}/deploy/rollback?retire=${retire}`, { timeout: 60_000 })).ok()).toBeTruthy();
}
