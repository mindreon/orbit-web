/**
 * Acceptance E1–E7 (13 §2) on the running stack: each scenario drives the task desk in the browser and checks a
 * backend fact (the API, Postgres, or Temporal) next to what the page shows.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  type Policy,
  addNodes, attemptIds, attemptRows, createTask, eventRows, eventually, followTask, getPlan, getTask, killControl, killWorker, networkOutage, openTask,
  planNodes, registerProfile, setTenantPolicy, release, rollBack, setControlReplica, registerSop, runningAttemptWorkflows, sql, taskStatus, toolRuns, waitForStatus, workflowVersion,
} from "./tasks";

// The mock streams each part of a `stream:` goal as it is; a part ends in a space so the worker's secret redactor releases it.
const SEP = "\u001f";
const unique = (label: string) => `${label} ${Date.now()}`;
/** 取消任务要在确认弹窗里再点一次。 */
const cancelTask = async (page: Page) => {
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认取消任务" }).click();
};

test("E1 an agent plans two nodes, they run to completion and the artifact downloads", async ({ page, request }) => {
  const title = unique("E1");
  // The mock agent explores, then commits the plan through TaskCreate / TaskUpdate.
  const taskId = await createTask(request, title, "plan:Draft report|Review report");

  await openTask(page, title);
  await expect(page.getByText(/plan v[2-9]/)).toBeVisible();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  await expect(planNodes(page)).toHaveCount(3);
  for (const node of await planNodes(page).all()) await expect(node).toHaveAttribute("data-status", "COMPLETED");

  const plan = await getPlan(request, taskId);
  expect(plan.plan_version).toBeGreaterThan(1);
  expect(plan.nodes.map((node) => node.title).sort()).toEqual(["Draft report", "Explore and plan", "Review report"]);
  expect(plan.nodes.map((node) => node.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED"]);
  // Every plan change came from the agent's attempt, each under its own idempotent command.
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'plan.version_committed'`)).toBe(String(plan.plan_version - 1));

  const artifact = page.getByRole("button", { name: "result.txt" }).first();
  await expect(artifact).toBeVisible();
  const manifests = (await (await request.get(`/v1/tasks/${taskId}/artifacts`)).json()).items as Array<{ manifest_id: string; entries: Array<{ name: string }> }>;
  const url = (await (await request.get(`/v1/artifacts/${manifests[0].manifest_id}/url?name=result.txt`)).json()).url as string;
  const download = await request.get(url);
  expect(download.status()).toBe(200);
  expect((await download.text()).length).toBeGreaterThan(0);
});

test("E2 an approval survives a worker restart and the tool runs once", async ({ page, request }) => {
  const title = unique("E2");
  const taskId = await createTask(request, title, "echo:once");
  await openTask(page, title);

  await expect(page.getByTestId("approval-item")).toHaveCount(1, { timeout: 30_000 });
  await expect(taskStatus(page)).toHaveAttribute("data-status", "WAITING");
  await expect(planNodes(page).first()).toHaveAttribute("data-status", "AWAITING_APPROVAL");

  // The browser goes away and the worker is killed while the approval waits.
  await page.close();
  await killWorker(request);

  const fresh = await page.context().newPage();
  await openTask(fresh, title);
  await expect(fresh.getByTestId("approval-item")).toHaveCount(1);
  await fresh.getByRole("button", { name: "批准" }).click();

  await waitForStatus(request, taskId, "COMPLETED");
  await expect(taskStatus(fresh)).toHaveAttribute("data-status", "COMPLETED");
  await expect(fresh.getByTestId("approval-item")).toHaveCount(0);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.requested'`)).toBe("1");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.decided'`)).toBe("1");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("1");
  // The call's end is a durable event too (tool.call_finished), once, with its state.
  expect(sql(`SELECT string_agg(body->'payload'->>'state', ',') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'tool.call_finished'`)).toBe("success");
  // The tool ran once: the ledger holds one side effect for this task's attempt, and it succeeded.
  expect(sql(`SELECT string_agg(status, ',') FROM idempotency_ledger WHERE scope = 'side_effect' AND key LIKE '${attemptIds(taskId)[0]}:%'`)).toBe("succeeded");
  // The session that the restarted worker resumed is a turn-end checkpoint: one for opening it, one for the parked
  // turn, one for the resumed turn, and the session id is the attempt id.
  expect(sql(`SELECT count(*) FROM checkpoints WHERE task_id = '${taskId}' AND attempt_id = '${attemptIds(taskId)[0]}' AND kind = 'agent_state' AND seq >= 1000000000`)).toBe("3");
});

test("E3 the agent asks a question and the same attempt continues with the answer", async ({ page, request }) => {
  const title = unique("E3");
  const taskId = await createTask(request, title, "ask:which color?");
  await openTask(page, title);

  await expect(page.getByTestId("agent-question")).toHaveText("which color?", { timeout: 30_000 });
  await expect(planNodes(page).first()).toHaveAttribute("data-status", "AWAITING_INPUT");
  await expect(taskStatus(page)).toHaveAttribute("data-status", "WAITING");
  await expect(attemptRows(page)).toHaveCount(1);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "parked_input");

  await page.getByPlaceholder("回复 Agent").fill("blue");
  await page.getByRole("button", { name: "回复" }).click();

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  await expect(attemptRows(page)).toHaveCount(1);
  await expect(attemptRows(page).first()).toHaveAttribute("data-attempt-no", "1");
  await expect(attemptRows(page).first()).toContainText("已恢复 1 次");
  expect(await getTask(request, taskId)).toMatchObject({ status: "COMPLETED" });
  expect(sql(`SELECT count(*) FROM task_messages WHERE task_id = '${taskId}'`)).toBe("1");
});

test("E4 an interrupt ends the running attempt and a new one takes the message", async ({ page, request }) => {
  const title = unique("E4");
  // Two held tool calls keep the attempt running for seconds, so the interrupt cannot arrive after it finished.
  const taskId = await createTask(request, title, `slow:e4-a-${Date.now()}|e4-b-${Date.now()}`);
  await openTask(page, title);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "running", { timeout: 30_000 });

  await page.getByPlaceholder("向任务发送消息").fill("change course");
  await page.getByRole("button", { name: "打断" }).click();

  await expect(attemptRows(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(attemptRows(page).nth(0)).toHaveAttribute("data-status", "cancelled");
  await expect(attemptRows(page).nth(1)).toHaveAttribute("data-attempt-no", "2");
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("2");
  expect(sql(`SELECT count(*) FROM task_messages WHERE task_id = '${taskId}' AND delivery = 'interrupt'`)).toBe("1");
});

test("E5 pause holds the next attempt, resume continues, cancel ends every child", async ({ page, request }) => {
  const paused = unique("E5 pause");
  const pausedId = await createTask(request, paused, `slow:e5p-${Date.now()}`);
  await addNodes(request, pausedId, [{ type: "agent_turn", title: "Second", goal: "second" }]);
  await openTask(page, paused);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "running", { timeout: 30_000 });

  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED");
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await expect(attemptRows(page)).toHaveCount(1);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED");

  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  await expect(attemptRows(page)).toHaveCount(2);

  const cancelled = unique("E5 cancel");
  const cancelledId = await createTask(request, cancelled, `slow:e5c-${Date.now()}`);
  await addNodes(request, cancelledId, [{ type: "agent_turn", title: "Second", goal: "second" }]);
  await openTask(page, cancelled);
  await expect(attemptRows(page).first()).toHaveAttribute("data-status", "running", { timeout: 30_000 });
  await cancelTask(page);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "CANCELLED", { timeout: 30_000 });
  await eventually(async () => runningAttemptWorkflows(cancelledId), (count) => count === 0, "every child AttemptWorkflow to end");
  expect((await getTask(request, cancelledId)).status).toBe("CANCELLED");
  for (const row of await attemptRows(page).all()) await expect(row).not.toHaveAttribute("data-status", "running");
});

test("E6 a worker killed in the second SOP step resumes without rerunning the first", async ({ page, request }) => {
  const title = unique("E6");
  const sop = await registerSop(request, "release", 1, ["draft", "review", "publish"]);
  // A version is immutable: the same steps again are accepted, different steps are a conflict.
  await registerSop(request, "release", 1, ["draft", "review", "publish"]);
  expect((await request.post("/v1/sops", { data: { sop_id: "release", version: 1, steps: ["draft"] } })).status()).toBe(409);
  const taskId = await createTask(request, title, "start");
  await addNodes(request, taskId, [{ type: "sop_stage", title: "Release", sop }]);
  await openTask(page, title);

  // Step 1 is checkpointed; step 2 is now running (the mock holds each step for 1.5s). Kill the worker there.
  await eventually(
    async () => Number(sql(`SELECT count(*) FROM checkpoints WHERE task_id = '${taskId}' AND kind = 'sop_run_state'`)),
    (count) => count >= 1,
    "the first SOP step to be checkpointed",
    60_000,
  );
  await killWorker(request);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  const sopAttempt = attemptRows(page).last();
  await expect(sopAttempt).toContainText("已恢复 1 次");
  await expect(sopAttempt).toHaveAttribute("data-attempt-no", "1");
  await expect(planNodes(page).last()).toHaveAttribute("data-status", "COMPLETED");
  // Each step wrote its checkpoint exactly once: step 1 was not run again.
  expect(sql(`SELECT string_agg(seq::text || 'x' || n::text, ',' ORDER BY seq) FROM (SELECT seq, count(*) n FROM checkpoints WHERE task_id = '${taskId}' AND kind = 'sop_run_state' GROUP BY seq) t`)).toBe("11x1,21x1,31x1");
});

test("E7 a dropped stream and a reload lose no durable event, and streamed text is finished or marked truncated", async ({ page, request }) => {
  const title = unique("E7");
  const taskId = await createTask(request, title, `stream:one ${SEP}two ${SEP}three ${SEP}four ${SEP}five `);
  await openTask(page, title);
  await expect(page.getByTestId("live-output")).toContainText("one", { timeout: 30_000 });

  await networkOutage(request, 1_500);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  const finalText = page.getByTestId("final-output");
  await expect(finalText).toContainText("one two three four five", { timeout: 30_000 });

  const contiguous = async () => {
    const seqs = (await eventRows(page).allTextContents()).map((row) => Number(/#(\d+)/.exec(row)?.[1]));
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, index) => index + 1));
    return seqs.length;
  };
  const durable = Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}'`));
  await expect.poll(contiguous).toBe(durable);

  await page.reload();
  await page.getByRole("link", { name: title }).click();
  await expect(finalText).toContainText("one two three four five");
  await expect.poll(contiguous).toBe(durable);
  expect((await getTask(request, taskId)).status).toBe("COMPLETED");
});

test("E8 a tool whose outcome is unknown is not repeated until a person approves (A12, A27)", async ({ page, request }) => {
  const title = unique("E8");
  const [first, second] = [`first-${Date.now()}`, `second-${Date.now()}`];
  const taskId = await createTask(request, title, `slow:${first}|${second}`);
  await openTask(page, title);

  // The first call finishes; the worker is killed while the second one is running.
  await eventually(async () => toolRuns(second), (runs) => runs === 1, "the second call to start", 60_000);
  await killWorker(request);

  // After the lost activity is retried, the second call is not run again on its own: a person is asked.
  await expect(page.getByTestId("approval-item")).toHaveCount(1, { timeout: 120_000 });
  await expect(taskStatus(page)).toHaveAttribute("data-status", "WAITING");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.requested' AND body->'payload'->'subject'->>'kind' = 'non_idempotent_retry'`)).toBe("1");
  expect(toolRuns(first)).toBe(1);
  expect(toolRuns(second)).toBe(1);

  await page.getByRole("button", { name: "批准" }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });

  // The first call came back from the ledger; only the unknown one ran again, once, with approval.
  expect(toolRuns(first)).toBe(1);
  expect(toolRuns(second)).toBe(2);
  const statuses = sql(`SELECT string_agg(status, ',' ORDER BY first_seen) FROM idempotency_ledger WHERE scope = 'side_effect' AND key LIKE '${attemptIds(taskId)[0]}:%'`);
  expect(statuses).toBe("succeeded,succeeded");
});

test("E9 an interrupt that lands inside a tool ends the call as interrupted and the attempt as cancelled (A32)", async ({ page, request }) => {
  const title = unique("E9");
  const text = `held-${Date.now()}`;
  const taskId = await createTask(request, title, `slow:${text}`);
  await openTask(page, title);
  await eventually(async () => toolRuns(text), (runs) => runs === 1, "the tool call to start", 60_000);

  await page.getByPlaceholder("向任务发送消息").fill("stop that");
  await page.getByRole("button", { name: "打断" }).click();

  await expect(attemptRows(page).nth(0)).toHaveAttribute("data-status", "cancelled", { timeout: 30_000 });
  // The cancelled call's ledger row stays `started`; the new attempt has its own calls and finishes the task.
  const [firstAttempt] = attemptIds(taskId);
  expect(sql(`SELECT status FROM idempotency_ledger WHERE scope = 'side_effect' AND key LIKE '${firstAttempt}:%'`)).toBe("started");
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  expect(await getTask(request, taskId)).toMatchObject({ status: "COMPLETED" });
});

test("E10 a spent exploration budget leaves only planning tools and, with no plan, the task waits for review (A10)", async ({ page, request }) => {
  const title = unique("E10");
  const stamp = Date.now();
  const profile = await registerProfile(request, `explorer${stamp}`, 1, { exploration: { max_tool_calls: 1 } });
  const [first, second, third] = [`one-${stamp}`, `two-${stamp}`, `three-${stamp}`];
  const taskId = await createTask(request, title, `slow:${first}|${second}|${third}`, profile);
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED_NEEDS_REVIEW", { timeout: 90_000 });
  await expect(planNodes(page).first()).toHaveAttribute("data-status", "BLOCKED");
  // One call fit the budget; the next two were refused before they could run.
  expect(toolRuns(first)).toBe(1);
  expect(toolRuns(second)).toBe(0);
  expect(toolRuns(third)).toBe(0);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'budget.exhausted'`)).toBe("1");
  expect((await getTask(request, taskId)).status).toBe("PAUSED_NEEDS_REVIEW");
});

test("E11 control restarted in the middle of a run loses no durable event and the page carries on (A15)", async ({ page, request }) => {
  const title = unique("E11");
  const taskId = await createTask(request, title, `stream:one ${SEP}two ${SEP}three ${SEP}four ${SEP}five `);
  await openTask(page, title);
  await expect(page.getByTestId("live-output")).toContainText("one", { timeout: 30_000 });

  await killControl(request);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });
  await expect(page.getByTestId("final-output")).toContainText("one two three four five", { timeout: 30_000 });
  const durable = Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}'`));
  await expect.poll(async () => {
    const seqs = (await eventRows(page).allTextContents()).map((row) => Number(/#(\d+)/.exec(row)?.[1]));
    return JSON.stringify(seqs) === JSON.stringify(Array.from({ length: durable }, (_, index) => index + 1));
  }).toBe(true);
  expect((await getTask(request, taskId)).status).toBe("COMPLETED");
});

const streamGoal = `stream:one ${SEP}two ${SEP}three ${SEP}four ${SEP}five `;

test("E12 with three control replicas every task streams whichever replica owns it, and shrinking the cluster loses no durable event (A30)", async ({ request }) => {
  test.setTimeout(240_000);
  const ids = await Promise.all(Array.from({ length: 6 }, (_, index) => createTask(request, unique(`E12-${index}`), streamGoal)));
  const followers = ids.map((id) => followTask(id));

  // The worker posts to one replica and the browser reads through another: the live text reaches every task's stream.
  await eventually(async () => followers.map((f) => f.events.some((e) => e.type === "agent.token_delta")), (seen) => seen.every(Boolean), "every task to stream live text", 90_000);

  // Take a replica out mid-run. Streams attached to it, or owned by it, reconnect with their last durable id.
  await setControlReplica(request, 2, "stop");
  await Promise.all(followers.map((f) => f.done));

  for (const [index, id] of ids.entries()) {
    const durable = followers[index].events.filter((event) => event.seq > 0).map((event) => event.seq);
    expect(durable, `task ${id} durable events`).toEqual(Array.from({ length: durable.length }, (_, i) => i + 1));
    expect(durable.length).toBe(Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${id}'`)));
    expect(followers[index].events.some((e) => e.type === "message.agent_final")).toBeTruthy();
  }
  await setControlReplica(request, 2, "start");
});

test("E13 releasing a new worker build moves new work over and leaves a running attempt where it is (T2.6)", async ({ request }) => {
  test.setTimeout(300_000);
  const text = `pinned-${Date.now()}`;
  const runningId = await createTask(request, unique("E13 running"), `slow:${text}`);
  await eventually(async () => toolRuns(text), (runs) => runs === 1, "the attempt to be inside its tool call", 60_000);
  const node = (await getPlan(request, runningId)).nodes[0].node_id;
  const attemptWorkflow = `attempt/${runningId}/${node}/1`;
  expect(workflowVersion(attemptWorkflow)).toEqual({ behavior: "VERSIONING_BEHAVIOR_PINNED", buildId: "v1" });

  // Release v2 while that attempt is mid-call. v1 workers stay up, so the pinned attempt finishes on v1.
  await release(request, "v2");
  try {
    await waitForStatus(request, runningId, "COMPLETED", 120_000);
    expect(workflowVersion(attemptWorkflow)).toEqual({ behavior: "VERSIONING_BEHAVIOR_PINNED", buildId: "v1" });
    // The task itself is auto-upgrading: it followed the current version.
    expect(workflowVersion(`task/default/${runningId}`).buildId).toBe("v2");

    // Work that starts now runs on v2, attempts included.
    const freshId = await createTask(request, unique("E13 fresh"), "start");
    await waitForStatus(request, freshId, "COMPLETED", 120_000);
    const freshNode = (await getPlan(request, freshId)).nodes[0].node_id;
    expect(workflowVersion(`attempt/${freshId}/${freshNode}/1`)).toEqual({ behavior: "VERSIONING_BEHAVIOR_PINNED", buildId: "v2" });
  } finally {
    await rollBack(request, "v2");
  }
});

test("E14 two calls need approval in one step: a person allows the first and refuses the second (A11)", async ({ page, request }) => {
  const title = unique("E14");
  const taskId = await createTask(request, title, "two:left|right");
  await openTask(page, title);

  // AgentScope asks about one call at a time; the other waits its turn inside the same attempt.
  await expect(page.getByTestId("approval-item")).toHaveCount(1, { timeout: 30_000 });
  // The item opens with the same heading every time; its approval id is what tells one request from the next.
  const firstApproval = (await page.getByTestId("approval-item").innerText()).split("\n").find((line) => line.startsWith("apr_")) ?? "";
  expect(firstApproval).not.toBe("");
  await page.getByRole("button", { name: "批准", exact: true }).click();
  // The second call asks next: a different approval replaces the first one in the inbox.
  await expect.poll(async () => {
    const items = page.getByTestId("approval-item");
    return (await items.count()) === 1 && !(await items.innerText()).includes(firstApproval);
  }, { timeout: 30_000 }).toBe(true);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "WAITING");
  await page.getByRole("button", { name: "拒绝", exact: true }).click();

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  expect(sql(`SELECT string_agg(body->'payload'->>'status', ',' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.decided'`)).toBe("APPROVED,REJECTED");
  // Only the allowed call ran: one side effect in the ledger, and it succeeded.
  expect(sql(`SELECT string_agg(status, ',') FROM idempotency_ledger WHERE scope = 'side_effect' AND key LIKE '${attemptIds(taskId)[0]}:%'`)).toBe("succeeded");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("1");
});

test("E15 an agent that declares its task unplannable leaves the node blocked and the task waiting for review", async ({ page, request }) => {
  const title = unique("E15");
  const taskId = await createTask(request, title, "unplannable:the goal contradicts itself");
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED_NEEDS_REVIEW", { timeout: 60_000 });
  await expect(planNodes(page).first()).toHaveAttribute("data-status", "BLOCKED");
  expect((await getTask(request, taskId)).status).toBe("PAUSED_NEEDS_REVIEW");
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'plan.version_committed'`)).toBe("1");
});

test("E16 a spent exploration budget is extended by a person and the agent goes on (A10)", async ({ page, request }) => {
  const title = unique("E16");
  const stamp = Date.now();
  const profile = await registerProfile(request, `stretch${stamp}`, 1, { exploration: { max_tool_calls: 1 } });
  const [first, second] = [`a-${stamp}`, `b-${stamp}`];
  const taskId = await createTask(request, title, `extend:${first}|${second}`, profile);
  await openTask(page, title);

  // The second call is refused; the agent asks for more budget and a person is asked to allow it.
  await expect(page.getByTestId("approval-item")).toHaveCount(1, { timeout: 60_000 });
  expect(toolRuns(second)).toBe(0);
  await page.getByRole("button", { name: "批准", exact: true }).click();

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });
  expect(toolRuns(first)).toBe(1);
  expect(toolRuns(second)).toBe(1);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'budget.exhausted'`)).toBe("0");
});

test("E17 a tool the profile denies is refused before it can run", async ({ page, request }) => {
  const title = unique("E17");
  const stamp = Date.now();
  const profile = await registerProfile(request, `narrow${stamp}`, 1, { tools: { denied: ["slow_echo"] } });
  const text = `never-${stamp}`;
  const taskId = await createTask(request, title, `slow:${text}`, profile);
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 60_000 });
  expect(toolRuns(text)).toBe(0);
  expect(sql(`SELECT string_agg(body->'payload'->>'state', ',') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'tool.call_finished'`)).toBe("denied");
});

test("E18 a refused SOP step is tried again with the verdict and the SOP still completes; too many refusals fail it", async ({ page, request }) => {
  const stamp = Date.now();
  const flaky = await registerSop(request, `flaky${stamp}`, 1, ["draft", "flaky-1", "publish"]);
  const title = unique("E18");
  const taskId = await createTask(request, title, "start");
  await addNodes(request, taskId, [{ type: "sop_stage", title: "Release", sop: flaky }]);
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  // Step 2 took two tries (its first was refused); steps 1 and 3 one each, all inside one attempt.
  expect(sql(`SELECT string_agg(seq::text, ',' ORDER BY seq) FROM checkpoints WHERE task_id = '${taskId}' AND kind = 'sop_run_state'`)).toBe("11,21,22,31");
  await expect(attemptRows(page).last()).toHaveAttribute("data-attempt-no", "1");

  // A step refused more often than it is allowed to be fails the SOP, and with it the attempt.
  const hopeless = await registerSop(request, `hopeless${stamp}`, 1, ["flaky-5"]);
  const failing = await createTask(request, unique("E18 fail"), "start");
  await addNodes(request, failing, [{ type: "sop_stage", title: "Doomed", sop: hopeless }]);
  await eventually(
    async () => sql(`SELECT count(*) FROM task_events WHERE task_id = '${failing}' AND event_type = 'attempt.finished' AND body->'payload'->>'outcome' = 'failed'`),
    (count) => Number(count) >= 1,
    "the doomed SOP attempt to fail",
    120_000,
  );
  expect(sql(`SELECT count(*) FROM checkpoints WHERE task_id = '${failing}' AND kind = 'sop_run_state' AND seq < 20`)).toBe("3");

  // A step names its own budget of tries: two refusals end it, though the default would allow a third.
  const strict = await registerSop(request, `strict${stamp}`, 1, [{ subject: "flaky-2", description: "must be right first or second time", max_attempts: 2 }]);
  const capped = await createTask(request, unique("E18 cap"), "start");
  await addNodes(request, capped, [{ type: "sop_stage", title: "Capped", sop: strict }]);
  await eventually(
    async () => sql(`SELECT count(*) FROM task_events WHERE task_id = '${capped}' AND event_type = 'attempt.finished' AND body->'payload'->>'outcome' = 'failed'`),
    (count) => Number(count) >= 1,
    "the capped SOP attempt to fail",
    120_000,
  );
  expect(sql(`SELECT string_agg(seq::text, ',' ORDER BY seq) FROM checkpoints WHERE task_id = '${capped}' AND kind = 'sop_run_state'`)).toBe("11,12");
});

test("E19 one agent-state checkpoint is taken per batch of tool calls, before the batch starts and never inside it (A27)", async ({ page, request }) => {
  const stamp = Date.now();
  // Three rounds with one call each: three batches, so three checkpoints, and none for the closing answer.
  const rounds = await createTask(request, unique("E19 rounds"), `slow:r1-${stamp}|r2-${stamp}|r3-${stamp}`);
  await waitForStatus(request, rounds, "COMPLETED", 120_000);
  expect(sql(`SELECT count(DISTINCT seq) FROM checkpoints WHERE task_id = '${rounds}' AND kind = 'agent_state' AND seq < 1000000000`)).toBe("3");

  // Two calls announced together are one batch: one checkpoint, even though a person decides them one by one.
  const title = unique("E19 batch");
  const batch = await createTask(request, title, "two:left|right");
  await openTask(page, title);
  await expect(page.getByTestId("approval-item")).toHaveCount(1, { timeout: 30_000 });
  // The item opens with the same heading every time; its approval id is what tells one request from the next.
  const firstApproval = (await page.getByTestId("approval-item").innerText()).split("\n").find((line) => line.startsWith("apr_")) ?? "";
  expect(firstApproval).not.toBe("");
  await page.getByRole("button", { name: "批准", exact: true }).click();
  await expect.poll(async () => {
    const items = page.getByTestId("approval-item");
    return (await items.count()) === 1 && !(await items.innerText()).includes(firstApproval);
  }, { timeout: 30_000 }).toBe(true);
  await page.getByRole("button", { name: "批准", exact: true }).click();
  await waitForStatus(request, batch, "COMPLETED", 60_000);
  expect(sql(`SELECT count(*) FROM checkpoints WHERE task_id = '${batch}' AND kind = 'agent_state' AND seq < 1000000000`)).toBe("1");
});

test("E20 tenant, task and profile policy layers only tighten each other (05 §6)", async ({ request }) => {
  const stamp = Date.now();
  const [a, b, c, d] = [`pa-${stamp}`, `pb-${stamp}`, `pc-${stamp}`, `pd-${stamp}`];
  const wide = await registerProfile(request, `wide${stamp}`, 1, {});
  const before = await setTenantPolicy(request, { denied_tools: ["slow_echo"] });
  try {
    // The tenant denies the tool: a task, whatever its own policy or profile says, cannot run it.
    const denied = await createTask(request, unique("E20 tenant"), `slow:${a}`, wide, { denied_tools: [] });
    await waitForStatus(request, denied, "COMPLETED", 60_000);
    expect(toolRuns(a)).toBe(0);
    expect(sql(`SELECT string_agg(body->'payload'->>'state', ',') FROM task_events WHERE task_id = '${denied}' AND event_type = 'tool.call_finished'`)).toBe("denied");
  } finally {
    await setTenantPolicy(request, before);
  }

  // Without the tenant's denial, the task layer denies it on its own.
  const byTask = await createTask(request, unique("E20 task"), `slow:${b}`, wide, { denied_tools: ["slow_echo"] });
  await waitForStatus(request, byTask, "COMPLETED", 60_000);
  expect(toolRuns(b)).toBe(0);

  // Caps combine to the smallest: the profile allows 5 calls, the task 1, so the second call is refused.
  const loose = await registerProfile(request, `loose${stamp}`, 1, { exploration: { max_tool_calls: 5 } });
  const capped = await createTask(request, unique("E20 cap"), `slow:${c}|${d}`, loose, { exploration_max_tool_calls: 1 });
  await waitForStatus(request, capped, "PAUSED_NEEDS_REVIEW", 90_000);
  expect(toolRuns(c)).toBe(1);
  expect(toolRuns(d)).toBe(0);

  // The tenant layer is stored and read back, and the task layer is part of the task.
  expect(((await (await request.get(`/v1/tasks/${capped}`)).json()) as { policy: Policy }).policy.exploration_max_tool_calls).toBe(1);
});

/** The node the test added, by title. */
const nodeTitled = async (request: APIRequestContext, taskId: string, title: string) =>
  (await getPlan(request, taskId)).nodes.find((node) => node.title === title)!;

/** Durable events of one task whose payload matches a jsonb condition. */
const eventCount = (taskId: string, type: string, where: string) =>
  Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = '${type}' AND ${where}`));

/** Waits for the projection to hold at least one such event: it lags the workflow by a moment. */
const eventRecorded = (taskId: string, type: string, where: string, what: string) =>
  eventually(async () => eventCount(taskId, type, where), (count) => count >= 1, what, 30_000);

test("E21 an attempt that misses its completion contract is refused, its node is not frozen and is tried again (04 §5)", async ({ page, request }) => {
  const title = unique("E21");
  // The exploration node is held for a few seconds so that the plan change lands while the task is open (as in E5).
  const taskId = await createTask(request, title, `slow:e21-${Date.now()}`);
  await addNodes(request, taskId, [{
    type: "agent_turn", title: "Report", goal: "write the report",
    completion_contract: { required_artifacts: [{ name: "report.md", media_type: "text/markdown" }] },
  }]);
  await openTask(page, title);

  // The mock attempt ends with a result.txt only, so no attempt of Report can meet the contract.
  const retried = await eventually(() => nodeTitled(request, taskId, "Report"), (node) => node.attempt_count >= 2, "the refused node to be tried again", 90_000);
  expect(retried.frozen).toBe(false);
  expect(retried.status).not.toBe("COMPLETED");
  await expect(page.locator('[data-testid="attempt-row"][data-status="failed"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(planNodes(page).filter({ hasText: "Report" })).not.toHaveAttribute("data-status", "COMPLETED");

  // The refusal is on record with its structured reason: the attempt failed as a verification failure, and the node's
  // move to RETRY_PENDING says why.
  const failed = `body->'payload'->>'outcome' = 'failed' AND body->'payload'->'failure'->>'failure_class' = 'verification' AND body->'payload'->'failure'->>'retryable' = 'true'`;
  await eventRecorded(taskId, "attempt.finished", `${failed} AND body->'payload'->'failure'->>'message' LIKE '%required_artifact/artifact_missing%report.md%'`, "the refused attempt's failure");
  await eventRecorded(taskId, "node.status_changed", `body->'payload'->>'to_status' = 'RETRY_PENDING' AND body->'payload'->>'reason' LIKE '%artifact_missing%'`, "the node's move to RETRY_PENDING with its reason");
  // No attempt of this node was ever reported completed, and the node never completed.
  expect(eventCount(taskId, "node.status_changed", `body->'payload'->>'node_id' = '${retried.node_id}' AND body->'payload'->>'to_status' = 'COMPLETED'`)).toBe(0);

  // Stop the retries.
  await cancelTask(page);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "CANCELLED", { timeout: 30_000 });
  expect((await nodeTitled(request, taskId, "Report")).frozen).toBe(false);
});

test("E22 an attempt that meets its completion contract, artifacts and a command on its workspace, is frozen", async ({ page, request }) => {
  const title = unique("E22");
  const taskId = await createTask(request, title, `slow:e22-${Date.now()}`);
  await addNodes(request, taskId, [{
    type: "agent_turn", title: "Report", goal: "write the report", workspace_access: "write",
    completion_contract: {
      required_artifacts: [{ name: "result.txt", media_type: "text/plain" }],
      verifications: [{ kind: "command", spec: { command: "test -d .", timeout_s: 60 } }],
    },
  }]);
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  const node = await nodeTitled(request, taskId, "Report");
  expect(node).toMatchObject({ status: "COMPLETED", frozen: true, attempt_count: 1 });
  // The manifest the check read is the one the worker stored with the workspace snapshot: the command ran on it.
  const manifest = sql(`SELECT count(*) FROM artifact_manifests WHERE task_id = '${taskId}' AND workspace_snapshot_id LIKE 'sha256:%'`);
  expect(Number(manifest)).toBeGreaterThanOrEqual(1);
  expect(eventCount(taskId, "attempt.finished", `body->'payload'->>'outcome' = 'failed'`)).toBe(0);
  expect(eventCount(taskId, "node.status_changed", `body->'payload'->>'node_id' = '${node.node_id}' AND body->'payload'->>'to_status' = 'RETRY_PENDING'`)).toBe(0);
});

test("E23 a command check that fails on the attempt's workspace refuses the completion with the exit code", async ({ page, request }) => {
  const title = unique("E23");
  const taskId = await createTask(request, title, `slow:e23-${Date.now()}`);
  await addNodes(request, taskId, [{
    type: "agent_turn", title: "Tested", goal: "make the tests pass", workspace_access: "write",
    completion_contract: { verifications: [{ kind: "command", spec: { command: "exit 3", timeout_s: 60 } }] },
  }]);
  await openTask(page, title);

  const retried = await eventually(() => nodeTitled(request, taskId, "Tested"), (node) => node.attempt_count >= 2, "the refused node to be tried again", 90_000);
  expect(retried.frozen).toBe(false);
  expect(retried.status).not.toBe("COMPLETED");
  await eventRecorded(taskId, "attempt.finished", `body->'payload'->'failure'->>'failure_class' = 'verification' AND body->'payload'->'failure'->>'message' LIKE '%command/command_failed%exited with 3%'`, "the refused attempt's failure");

  await cancelTask(page);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "CANCELLED", { timeout: 30_000 });
});
