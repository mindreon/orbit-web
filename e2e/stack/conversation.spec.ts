/**
 * Acceptance E42-E46, E48, E49 (15 M10): what the conversation shows.
 *
 * E42: a model that leaks its reasoning into the reply and closes it with a `</think>` tag nobody opened. The reasoning
 * is folded into a collapsed panel; the rest of the reply stays as it was.
 *
 * E43: the composer has one action button that says what a click does now: send, stop while the task runs, continue after
 * a stop. Cancelling a task is not one of the buttons that are always there; it is in the menu of the header.
 *
 * E44: an approval says what it is for, and can be allowed once, allowed for the rest of the task, or refused.
 *
 * E45: approvals that follow one another each show up, one at a time, and are gone once answered (a decided approval that
 * stayed in the list, or a new one that never got in, left the person with nothing to click).
 *
 * E50: an interrupt while an approval is pending cancels it: the card says so and has no buttons, and the attempt that takes
 * over carries on the same conversation.
 *
 * E51: a node that keeps failing is retried, then blocked, and the task asks for a person: the page says why and "继续" puts
 * the node back in play. The mock model fails every request of a conversation that started with `fail:`; the retry backoff
 * (5 s, 30 s) is a constant of the workflow, so this one takes about a minute.
 */
import { expect, test } from "@playwright/test";
import { attemptIds, attemptRows, createTask, eventually, getTask, openTask, planNodes, sql, taskStatus, waitForStatus } from "./tasks";

const unique = (label: string) => `${label} ${Date.now()}`;

test("E42 reasoning a model leaks into its reply is folded away, and nothing else is", async ({ page, request }) => {
  const title = unique("E42");
  const created = await request.post("/v1/tasks", { data: { title, goal: "think:first I will look|I should plan the table first|The table is ready." }, timeout: 120_000 });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task_id as string;
  await openTask(page, title);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);

  const message = page.getByTestId("agent-message");
  // The answer stays; the tag never shows.
  await expect(message).toContainText("The table is ready.");
  await expect(message).not.toContainText("</think>");
  // The reasoning is in a panel that is closed, and not in the answer.
  const panel = message.getByTestId("thinking");
  await expect(panel).toHaveCount(1);
  expect(await panel.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  expect(await panel.textContent()).toContain("I should plan the table first");
  await expect(message.getByTestId("final-output")).not.toContainText("I should plan the table first");
});

test("E43 the composer has one button: send, stop while it runs, continue after a stop", async ({ page, request }) => {
  const title = unique("E43");
  // Two held tool calls keep the attempt running for seconds.
  await createTask(request, title, `slow:e43a-${Date.now()}|e43b-${Date.now()}`);
  await openTask(page, title);
  const action = page.getByTestId("composer-action");
  const box = page.getByPlaceholder("向任务发送消息");

  // While it runs and nothing is typed the button stops it; with something typed it sends.
  await expect(action).toHaveAttribute("data-state", "stop", { timeout: 30_000 });
  await box.fill("and then?");
  await expect(action).toHaveAttribute("data-state", "send");
  await box.fill("");
  await expect(action).toHaveAttribute("data-state", "stop");
  // The header does not carry a row of buttons any more.
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消", exact: true })).toHaveCount(0);

  await action.click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED", { timeout: 30_000 });
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "cancelled", { timeout: 30_000 });
  await expect(action).toHaveAttribute("data-state", "continue");
  // It says what happened and what to do, in words: no raw status names, no attempt numbers.
  await expect(page.getByText("已停止，点击右下角的 ▶ 继续")).toBeVisible();
  await expect(page.getByTestId("plan-node")).not.toContainText("RETRY_PENDING");
  await expect(page.getByTestId("plan-node")).toContainText("待重试");

  await action.click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  // At rest and nothing typed: send, and nothing to send.
  await expect(action).toHaveAttribute("data-state", "send");
  await expect(action).toBeDisabled();
  await expect(page.getByTestId("final-output")).not.toContainText("Attempt");
  await expect(attemptRows(page).nth(1)).toContainText("第 2 次执行");

  // Cancelling is in the menu, and asks again.
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "取消任务" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认取消任务" }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "CANCELLED", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "更多操作" })).toHaveCount(0);
});

const approvalsAsked = (taskId: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.requested'`));

test("E44 an approval says what it is for, and can be allowed once or for the rest of the task", async ({ page, request }) => {
  const title = unique("E44");
  // Two printf commands, then another command: the first is allowed for good, so only the other asks again.
  const taskId = await createTask(request, title, "chain:sh:printf one > a.txt;;sh:printf two > b.txt;;sh:date > c.txt");
  await openTask(page, title);

  const card = page.getByTestId("approval-item");
  await expect(card).toBeVisible({ timeout: 60_000 });
  // It says what is asked, not only that something is.
  await expect(card).toContainText("Bash");
  await expect(card).toContainText("printf one > a.txt");
  await expect(card.getByRole("button", { name: "允许一次" })).toBeVisible();
  await expect(card.getByRole("button", { name: "拒绝" })).toBeVisible();
  await card.getByRole("button", { name: /本任务总是允许/ }).click();

  // The second printf runs without asking; the third command is another one and asks.
  await expect(card).toContainText("date > c.txt", { timeout: 60_000 });
  expect(approvalsAsked(taskId)).toBe(2);
  await card.getByRole("button", { name: "允许一次" }).click();
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const names = async () => ((await (await request.get(`/v1/tasks/${taskId}/artifacts`)).json()).items as Array<{ entries: Array<{ name: string }> }>).flatMap((m) => m.entries.map((e) => e.name));
  expect(await names()).toEqual(expect.arrayContaining(["a.txt", "b.txt", "c.txt"]));
  // What was allowed for good is on the record.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.decided' AND body->'payload'->>'always' = 'true'`)).toBe("1");

  // The same task, a later message, a later attempt: printf is still allowed, date is not.
  expect((await request.post(`/v1/tasks/${taskId}/messages`, { data: { text: "chain:sh:printf three > d.txt;;sh:date > e.txt" } })).ok()).toBeTruthy();
  await expect(card).toContainText("date > e.txt", { timeout: 60_000 });
  expect(approvalsAsked(taskId)).toBe(3);
  await card.getByRole("button", { name: "拒绝" }).click();
  await eventually(async () => (await names()).includes("d.txt"), Boolean, "the printf of the later attempt to have run without asking", 60_000);
  expect(await names()).not.toContain("e.txt");
});

test("E45 approvals that follow one another each show up, and are gone once answered", async ({ page, request }) => {
  const title = unique("E45");
  const taskId = await createTask(request, title, "chain:sh:printf 1 > 1.txt;;sh:printf 2 > 2.txt;;sh:printf 3 > 3.txt;;sh:printf 4 > 4.txt;;sh:printf 5 > 5.txt");
  await openTask(page, title);
  const card = page.getByTestId("approval-item");
  for (let step = 1; step <= 5; step += 1) {
    await expect(card).toContainText(`printf ${step} > ${step}.txt`, { timeout: 60_000 });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "允许一次" }).click();
  }
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  await expect(card).toHaveCount(0);
  expect(((await (await request.get(`/v1/tasks/${taskId}`)).json()).pending_approvals ?? []).length).toBe(0);
});

// E46: the commands an agent really writes are not one simple command. "Always allow" for one of them allows the Bash of
// the task. What still asks (a command that expands something is always asked about, a delete too) does not offer
// "always" again, and says why.
test("E46 always allowing a compound command allows the Bash of the task, and what still asks says why", async ({ page, request }) => {
  const title = unique("E46");
  const taskId = await createTask(request, title, "chain:sh:printf a > a.txt && printf b > b.txt;;sh:date > c.txt || true;;sh:printf $(date +%Y) > d.txt;;sh:rm -rf /");
  await openTask(page, title);
  const card = page.getByTestId("approval-item");

  await expect(card).toContainText("printf a > a.txt && printf b > b.txt", { timeout: 60_000 });
  await expect(card).toContainText("Bash（所有调用）");
  await card.getByRole("button", { name: /本任务总是允许/ }).click();

  // The other compound command runs without asking. The command that expands something asks all the same, and does not
  // offer "always" again.
  await expect(card).toContainText("printf $(date +%Y) > d.txt", { timeout: 60_000 });
  expect(approvalsAsked(taskId)).toBe(2);
  await expect(card.getByRole("button", { name: /总是允许/ })).toHaveCount(0);
  await expect(card).toContainText("每次都需要你确认");
  await card.getByRole("button", { name: "允许一次" }).click();

  // So does the delete.
  await expect(card).toContainText("rm -rf /", { timeout: 60_000 });
  await expect(card.getByRole("button", { name: /总是允许/ })).toHaveCount(0);
  await expect(card).toContainText("每次都需要你确认");
  await card.getByRole("button", { name: "拒绝" }).click();
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect(approvalsAsked(taskId)).toBe(3);
  const names = ((await (await request.get(`/v1/tasks/${taskId}/artifacts`)).json()).items as Array<{ entries: Array<{ name: string }> }>).flatMap((m) => m.entries.map((e) => e.name));
  expect(names).toEqual(expect.arrayContaining(["a.txt", "b.txt", "c.txt"]));
});

test("E48 the artifacts panel lists a file once, as it is now, while each reply keeps its own version", async ({ page, request }) => {
  const title = unique("E48");
  const taskId = await createTask(request, title, "file:note.md|first version");
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect((await request.post(`/v1/tasks/${taskId}/messages`, { data: { text: "file:note.md|second version" } })).ok()).toBeTruthy();
  await eventually(async () => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'task.completed'`)), (n) => n === 2, "the second reply", 90_000);
  await openTask(page, title);

  // Two replies, each with its own card; the panel has the file once.
  await expect(page.getByTestId("agent-message").getByRole("button", { name: /^note\.md/ })).toHaveCount(2);
  await expect(page.getByLabel("成果物").getByText("note.md")).toHaveCount(1);
});

test("E49 reasoning that arrives in the model's own field is folded away too", async ({ page, request }) => {
  const title = unique("E49");
  // The mock streams `reason:` before the `|` as thinking-block deltas, not as text with a tag.
  const created = await request.post("/v1/tasks", { data: { title, goal: "reason:先把总数和脚数对上|算完了：鸡 23 只，兔 12 只。" }, timeout: 120_000 });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task_id as string;
  await openTask(page, title);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);

  const message = page.getByTestId("agent-message");
  await expect(message).toContainText("鸡 23 只");
  const panel = message.getByTestId("thinking");
  await expect(panel).toHaveCount(1);
  expect(await panel.textContent()).toContain("先把总数和脚数对上");
  await expect(message.getByTestId("final-output")).not.toContainText("先把总数和脚数对上");
});

test("E50 an interrupt while an approval is pending cancels it, and the next attempt remembers the conversation", async ({ page, request }) => {
  const title = unique("E50");
  const taskId = await createTask(request, title, "echo:once");
  await openTask(page, title);

  const pending = page.locator('[data-testid="approval-item"][data-state="pending"]');
  await expect(pending).toBeVisible({ timeout: 60_000 });
  expect((await getTask(request, taskId)).pending_approvals).toHaveLength(1);

  await page.getByPlaceholder("向任务发送消息").fill("history:");
  await page.getByPlaceholder("向任务发送消息").press("Control+Enter");

  // The same card, now settled: it says cancelled and offers nothing to click.
  const cancelled = page.locator('[data-testid="approval-item"][data-state="cancelled"]');
  await expect(cancelled).toContainText("已取消", { timeout: 30_000 });
  await expect(cancelled.getByRole("button")).toHaveCount(0);
  // The backend's record: the approval's end is a durable CANCELLED decision, and the cancelled one is not pending.
  const cancelledId = sql(`SELECT body->'payload'->>'approval_id' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.decided' AND body->'payload'->>'status' = 'CANCELLED'`);
  expect((await getTask(request, taskId)).pending_approvals ?? []).not.toContain(cancelledId);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.decided' AND body->'payload'->>'status' = 'CANCELLED'`)).toBe("1");

  // The replacement attempt carries on the session and receives only the new message, so it asks for nothing again.
  await expect(pending).toHaveCount(0);
  // The replacement attempt answers with everything the user said: it carried on the session of the cancelled one.
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const answer = page.getByTestId("final-output").last();
  await expect(answer).toContainText("history=echo:once", { timeout: 30_000 });
  await expect(answer).toContainText("history:");
  expect(attemptIds(taskId).length).toBe(2);
});

test("E51 a node that keeps failing is retried and then blocked; the page says why and continue puts it back in play", async ({ page, request }) => {
  test.setTimeout(240_000);
  const title = unique("E51");
  const taskId = await createTask(request, title, "fail:the model is down");
  await openTask(page, title);

  // First failure: the node waits to be retried and the plan says why.
  const node = planNodes(page).first();
  await expect(node).toHaveAttribute("data-status", "RETRY_PENDING", { timeout: 60_000 });
  await expect(node.getByTestId("plan-node-reason")).toContainText("模型服务暂时出错");

  // Retries are used up: blocked, and the task waits for a person.
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED_NEEDS_REVIEW", { timeout: 150_000 });
  await expect(node).toHaveAttribute("data-status", "BLOCKED");
  const notice = page.getByTestId("review-notice");
  await expect(notice).toBeVisible();
  await expect(notice.getByTestId("review-reason")).toContainText("3 of 3 attempts failed");
  await expect(notice.getByTestId("review-reason")).toContainText("模型服务暂时出错");
  await expect(node.getByTestId("plan-node-reason")).toContainText("retries are used up");
  // Each failed attempt says what kind of failure it was.
  await expect(page.getByTestId("attempt-failure")).toHaveCount(3);
  await expect(page.getByTestId("attempt-failure").first()).toContainText("模型出错");
  await expect(attemptRows(page)).toHaveCount(3);

  expect((await getTask(request, taskId)).status).toBe("PAUSED_NEEDS_REVIEW");
  const toStatus = (status: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'node.status_changed' AND body->'payload'->>'to_status' = '${status}' AND body->'payload'->>'reason' <> ''`));
  expect(toStatus("RETRY_PENDING")).toBe(2);
  expect(toStatus("BLOCKED")).toBe(1);

  // Continue: the blocked node is back in play and the task runs again.
  await notice.getByRole("button", { name: "继续" }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "RUNNING", { timeout: 30_000 });
  await expect(page.getByTestId("review-notice")).toHaveCount(0);
  await expect(node).not.toHaveAttribute("data-status", "BLOCKED");
  expect((await request.post(`/v1/tasks/${taskId}/control`, { data: { action: "cancel" } })).status()).toBe(202);
});
