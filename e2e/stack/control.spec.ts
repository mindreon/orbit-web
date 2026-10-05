/**
 * Acceptance E52-E54 (15 M11): what a person can do about the budget, the agents and the experts of a task.
 *
 * E52: a task whose budget runs out waits for a person: the page says the budget is spent, and "追加预算" lets it go on from
 * where it stopped. The mock model reports ORBIT_MOCK_TOKENS_PER_CALL (10) tokens in and out per model call (up.mjs), so a
 * 50 token budget is spent by the third call of a four-step chain. Nobody priced the model: the cost reads 未知, not 0.
 *
 * E53: a person takes the task over, completes the step by hand with a reason, and hands it back; the task goes on from there.
 * A step that is running cannot be completed by hand: control refuses it with a type in the body.
 *
 * E54: a node is switched to another expert. That expert is not one of the task's own, so the switch waits for an approval
 * card; once approved it applies from the node's next attempt, which says which expert it was switched from.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { attemptIds, attemptRows, eventually, getPlan, getTask, openTask, planNodes, sql, taskStatus, waitForStatus } from "./tasks";

const unique = (label: string) => `${label} ${Date.now()}`;

/** The mock `slow` tool is read-only here, but a step may still ask: answer every pending approval while waiting. */
const approveAllWhile = async (request: APIRequestContext, taskId: string) => {
  const pending = (await getTask(request, taskId)).pending_approvals ?? [];
  for (const id of pending) await request.post(`/v1/tasks/${taskId}/approvals/${id}`, { data: { decision: "approve" } });
};

async function createWithBudget(request: APIRequestContext, title: string, goal: string, budgets: Record<string, number>): Promise<string> {
  const response = await request.post("/v1/tasks", { data: { title, goal, budgets }, timeout: 120_000 });
  expect(response.status()).toBe(201);
  return (await response.json()).task_id as string;
}

test("E52 a task that spends its budget waits for a person, and more budget lets it go on", async ({ page, request }) => {
  test.setTimeout(240_000);
  const title = unique("E52");
  const taskId = await createWithBudget(request, title, "chain:slow:e52a;;slow:e52b;;slow:e52c;;slow:e52d", { tokens: 50 });
  await openTask(page, title);

  await eventually(async () => { await approveAllWhile(request, taskId); return getTask(request, taskId); }, (task) => task.status === "PAUSED_NEEDS_REVIEW", "the budget hold", 150_000);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED_NEEDS_REVIEW", { timeout: 30_000 });
  const notice = page.getByTestId("review-notice");
  await expect(notice).toHaveAttribute("data-kind", "budget");
  await expect(notice).toContainText("预算用尽");
  await expect(page.getByTestId("attempt-failure").first()).toContainText("预算用尽");
  // What it spent is shown, and the cost nobody priced is unknown, not zero.
  await expect(page.getByTestId("usage-row").and(page.locator('[data-key="cost_usd_micros"]')).getByTestId("usage-used")).toHaveText("未知");
  await expect(page.getByTestId("usage-row").and(page.locator('[data-key="tokens"]'))).toContainText("上限 50");

  // A grant that asks for nothing is refused before anything is sent; a real one lets the task go on.
  await notice.getByTestId("grant-submit").click();
  await expect(notice.getByTestId("grant-error")).toBeVisible();
  await notice.getByTestId("grant-tokens").fill("1000");
  await notice.getByTestId("grant-submit").click();
  await expect(page.getByTestId("review-notice")).toHaveCount(0, { timeout: 30_000 });

  await eventually(async () => { await approveAllWhile(request, taskId); return getTask(request, taskId); }, (task) => task.status === "COMPLETED", "the task to finish after the grant", 180_000);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'budget.granted'`)).toBe("1");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("2");
  await expect(page.getByTestId("usage-row").and(page.locator('[data-key="tokens"]'))).toContainText("上限 1,050");
});

test("E53 a person takes the task over, completes a step by hand, and hands it back", async ({ page, request }) => {
  test.setTimeout(180_000);
  const title = unique("E53");
  const stamp = Date.now();
  const taskId = await createWithBudget(request, title, `slow:e53a-${stamp}|e53b-${stamp}`, {});
  await openTask(page, title);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "running", { timeout: 60_000 });

  // A step an attempt is running on cannot be completed by hand, and control says why with a type.
  const nodeId = (await getPlan(request, taskId)).nodes[0].node_id;
  const early = await request.post(`/v1/tasks/${taskId}/nodes/${nodeId}/complete`, { data: { reason: "too early" } });
  expect(early.status()).toBe(409);
  expect((await early.json()).code).toBe("NODE_RUNNING");

  // Take over from the menu: the agents stop and the page says so.
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByTestId("takeover").click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "TAKEN_OVER", { timeout: 30_000 });
  await expect(page.getByTestId("takeover-notice")).toBeVisible();
  await eventually(() => getPlan(request, taskId), (plan) => !["RUNNING", "VERIFYING"].includes(plan.nodes[0].status), "the attempt to stop", 60_000);

  // Complete the step by hand: a reason is needed, and it is kept on the step.
  const node = planNodes(page).first();
  await node.getByTestId("node-menu").click();
  await page.getByTestId("node-action-complete").click();
  await expect(page.getByTestId("node-action-submit")).toBeDisabled();
  await page.getByTestId("node-action-reason").fill("I finished it myself");
  await page.getByTestId("node-action-submit").click();
  await expect(node).toHaveAttribute("data-status", "COMPLETED", { timeout: 30_000 });
  await expect(node.getByTestId("plan-node-by-hand")).toContainText("I finished it myself");
  expect(sql(`SELECT body->'payload'->>'reason' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'node.status_changed' AND body->'payload'->>'to_status' = 'COMPLETED'`)).toBe("I finished it myself");
  // The step is done and frozen: it has no menu any more.
  await expect(node.getByTestId("node-menu")).toHaveCount(0);

  // Hand it back: nothing is left to do, so the task is idle (COMPLETED) again.
  await page.getByTestId("takeover-handback").click();
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  await expect(page.getByTestId("takeover-notice")).toHaveCount(0);
});

test("E54 a node switched to another expert waits for an approval, then runs as that expert from its next attempt", async ({ page, request }) => {
  test.setTimeout(240_000);
  const title = unique("E54");
  const mark = `Always answer like a pirate ${Date.now()}.`;
  const expertName = unique("E54 expert");
  const expert = await request.post("/v1/experts", { data: { name: expertName, instructions: mark } });
  expect(expert.status()).toBe(201);
  const { ref } = (await expert.json()) as { ref: string };
  const stamp = Date.now();
  const taskId = await createWithBudget(request, title, `slow:e54a-${stamp}|e54b-${stamp}`, {});
  await openTask(page, title);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "running", { timeout: 60_000 });

  // Ask for the switch from the node's menu.
  const node = planNodes(page).first();
  await node.getByTestId("node-menu").click();
  await page.getByTestId("node-action-switch").click();
  await page.getByTestId("switch-expert").selectOption(ref);
  await page.getByTestId("node-action-submit").click();
  await expect(page.getByTestId("action-notice")).toContainText("等你批准");

  // The expert is not one of the task's own: an approval card says what changes, and approving it applies the switch.
  const card = page.locator('[data-testid="approval-item"][data-kind="profile_switch"]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  // It names the expert, not its id@version (the display layer hides refs).
  await expect(card).toContainText(expertName);
  await expect(card).not.toContainText(ref);
  await card.getByTestId("approval-approve").click();
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  await expect(node.getByTestId("plan-node-switch")).toContainText("从下一次执行起生效", { timeout: 30_000 });
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'profile.switched'`)).toBe("1");
  // The attempt that was running is not touched.
  expect(attemptIds(taskId)).toHaveLength(1);

  // The next attempt (an interrupt starts one) runs as the new expert and says where it came from.
  await page.getByPlaceholder("向任务发送消息").fill("prompt:");
  await page.getByPlaceholder("向任务发送消息").press("Control+Enter");
  await waitForStatus(request, taskId, "COMPLETED", 120_000);
  await expect(page.getByTestId("final-output").last()).toContainText(mark, { timeout: 30_000 });
  await expect(page.getByTestId("attempt-switched")).toContainText("切换而来");
  await expect(attemptRows(page).last().getByTestId("attempt-switched")).toBeVisible();
  const switchedFrom = sql(`SELECT body->'payload'->>'switched_from' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started' ORDER BY seq DESC LIMIT 1`);
  expect(switchedFrom).not.toBe("");
  await expect(node.getByTestId("plan-node-switch")).toHaveCount(0);
});
