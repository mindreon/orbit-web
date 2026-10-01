/**
 * Acceptance E33-E34 (15 M9): a task is a conversation. When its plan is done it rests, it can be talked to again, and the
 * follow-up carries on the agent's own conversation. Only a cancel ends it.
 *
 * The mock model's `history:` command answers with everything the user said so far, which is how these tests see that a
 * follow-up carried on the session of the attempt before it.
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { eventually, sql, waitForStatus } from "./tasks";

const INFRA = resolve(process.env.ORBIT_INFRA_DIR ?? join(process.cwd(), ".."));
const TEMPORAL = join(process.env.ORBIT_STACK_DIR ?? join(INFRA, ".stack"), "bin", "temporal");
const unique = (label: string) => `${label} ${Date.now()}`;

/** What Temporal itself says about the task's workflow: "Running" until the task is cancelled. */
function workflowStatus(taskId: string): string {
  const out = execFileSync(TEMPORAL, ["workflow", "describe", "--address", "127.0.0.1:17233", "--workflow-id", `task/default/${taskId}`, "--output", "json"], { encoding: "utf8" });
  return (JSON.parse(out) as { workflowExecutionInfo: { status: string } }).workflowExecutionInfo.status;
}

const say = (request: APIRequestContext, taskId: string, text: string) => request.post(`/v1/tasks/${taskId}/messages`, { data: { text } });
const attempts = (taskId: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`));
const finals = (taskId: string) => sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq`).split("\n").filter(Boolean);

/** Waits until the task has run `count` attempts and rested again. */
const restedAfter = async (request: APIRequestContext, taskId: string, count: number) => {
  await eventually(async () => attempts(taskId), (n) => n === count, `attempt ${count} to start`, 60_000);
  await eventually(async () => (await (await request.get(`/v1/tasks/${taskId}`)).json()).status as string, (s) => s === "COMPLETED", `the task to rest after attempt ${count}`, 90_000);
  await eventually(async () => finals(taskId).length, (n) => n >= count, `the reply of attempt ${count}`, 30_000);
};

test("E33 a finished task stays open: the next message carries on the conversation, and only a cancel ends it", async ({ request }) => {
  const created = await request.post("/v1/tasks", { data: { title: unique("E33"), goal: "the first thing I said" } });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task_id as string;
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect(workflowStatus(taskId)).toBe("WORKFLOW_EXECUTION_STATUS_RUNNING");

  // It rests; a message starts another round, and that round remembers what was said.
  expect((await say(request, taskId, "history:")).ok()).toBeTruthy();
  await restedAfter(request, taskId, 2);
  const second = finals(taskId).at(-1) ?? "";
  expect(second).toContain("the first thing I said");
  expect(second).toContain("history:");

  // And again: the third round remembers both.
  expect((await say(request, taskId, "history:")).ok()).toBeTruthy();
  await restedAfter(request, taskId, 3);
  expect((finals(taskId).at(-1) ?? "").split(" | ").length).toBeGreaterThanOrEqual(3);

  // The plan grew by one node per follow-up, and the status went back to RUNNING each time.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'task.completed'`)).toBe("3");
  expect(Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'task.status_changed' AND body->'payload'->>'to_status' = 'RUNNING'`))).toBeGreaterThanOrEqual(3);
  expect(workflowStatus(taskId)).toBe("WORKFLOW_EXECUTION_STATUS_RUNNING");

  // Only a cancel ends it. Then no message and no configuration is taken.
  expect((await request.post(`/v1/tasks/${taskId}/control`, { data: { action: "cancel" } })).status()).toBe(202);
  await waitForStatus(request, taskId, "CANCELLED", 60_000);
  const refused = await say(request, taskId, "anyone there?");
  expect(refused.status()).toBe(409);
  expect(await refused.text()).toContain("TASK_CLOSED");
  await eventually(async () => workflowStatus(taskId), (s) => s === "WORKFLOW_EXECUTION_STATUS_COMPLETED", "the workflow to end after the cancel", 30_000);
});

test("E34 in the browser a finished task can be talked to again, and a cancelled one cannot", async ({ page, request }) => {
  const created = await request.post("/v1/tasks", { data: { title: unique("E34"), goal: "something to remember" } });
  const taskId = (await created.json()).task_id as string;
  await waitForStatus(request, taskId, "COMPLETED", 90_000);

  await page.goto(`/tasks/${taskId}`);
  const box = page.getByPlaceholder("向任务发送消息");
  await expect(box).toBeEnabled();
  await expect(page.getByText("任务已结束")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消", exact: true })).toBeVisible();
  await box.fill("history:");
  await box.press("Enter");
  await expect(page.getByTestId("task-status")).toHaveAttribute("data-status", "RUNNING", { timeout: 30_000 });
  await expect(page.getByTestId("task-status")).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  await expect(page.getByText("something to remember").first()).toBeVisible();
  expect(attempts(taskId)).toBe(2);

  // Cancelling is the one way to end it, and the page says so.
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认取消任务" }).click();
  await expect(page.getByTestId("task-status")).toHaveAttribute("data-status", "CANCELLED", { timeout: 30_000 });
  await expect(page.getByPlaceholder("任务已取消，新建任务继续")).toBeDisabled();
});
