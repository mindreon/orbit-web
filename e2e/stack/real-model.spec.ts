/**
 * Smoke against a real model (`STACK_MODEL=real pnpm test:stack -g real`): what only a real model can show. Mock-only
 * triggers (`slow:`, `plan:`, ...) are not used; each goal is plain language. Skipped on the mock stack.
 */
import { expect, test } from "@playwright/test";
import { addNodes, createTask, eventually, getPlan, openTask, registerSop, sql, taskStatus, waitForStatus } from "./tasks";

test.skip(process.env.STACK_MODEL !== "real", "needs STACK_MODEL=real");
test.describe.configure({ timeout: 240_000 });

const unique = (label: string) => `${label} ${Date.now()}`;

test("real model: a plain goal completes, streams text and leaves a manifest artifact", async ({ page, request }) => {
  const title = unique("REAL plain");
  const taskId = await createTask(request, title, "Reply with one short sentence greeting the user. Do not use any tools.");
  await openTask(page, title);

  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 180_000 });
  const finalText = await page.getByTestId("final-output").first().innerText();
  expect(finalText.trim().length).toBeGreaterThan(5);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'artifact.manifest_created'`)).toBe("1");
  expect(Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final'`))).toBe(1);
});

test("real model: the agent can ask the user a question and continue with the answer", async ({ page, request }) => {
  const title = unique("REAL ask");
  const taskId = await createTask(request, title, "Use your ask_user tool to ask me which colour I prefer, wait for my answer, then repeat the colour back in one sentence.");
  await openTask(page, title);

  await expect(page.getByTestId("agent-question")).toBeVisible({ timeout: 120_000 });
  await page.getByPlaceholder("回复 Agent").fill("green");
  await page.getByRole("button", { name: "回复" }).click();

  await waitForStatus(request, taskId, "COMPLETED", 180_000);
  await expect(page.getByTestId("final-output").first()).toContainText(/green/i);
  await expect(page.getByTestId("attempt-row")).toHaveCount(1);
});

test("real model: the agent plans with TaskCreate and the plan runs", async ({ page, request }) => {
  const title = unique("REAL plan");
  const taskId = await createTask(request, title, "Use your TaskCreate tool to create exactly two tasks. First: subject 'Draft', description 'Reply with the single word draft. Do not ask questions or use tools.' Second: subject 'Review', description 'Reply with the single word reviewed. Do not ask questions or use tools.' Then stop.");
  await openTask(page, title);

  await eventually(async () => (await getPlan(request, taskId)).nodes.length, (count) => count >= 3, "the agent's tasks to appear in the plan", 180_000);
  await waitForStatus(request, taskId, "COMPLETED", 220_000);
  expect((await getPlan(request, taskId)).nodes.every((node) => node.status === "COMPLETED")).toBeTruthy();
});

test("real model: an SOP's executor and verifier accept a good step and the SOP completes", async ({ page, request }) => {
  const title = unique("REAL sop");
  const sop = await registerSop(request, `real${Date.now()}`, 1, ["Reply with exactly the word alpha and nothing else", "Reply with exactly the word beta and nothing else"]);
  const taskId = await createTask(request, title, "Reply with one word. Do not use tools.");
  await addNodes(request, taskId, [{ type: "sop_stage", title: "Two steps", sop }]);
  await openTask(page, title);

  await waitForStatus(request, taskId, "COMPLETED", 200_000);
  // One try per step: the verifier accepted both first time.
  expect(sql(`SELECT string_agg(seq::text, ',' ORDER BY seq) FROM checkpoints WHERE task_id = '${taskId}' AND kind = 'sop_run_state'`)).toBe("11,21");
});

test("real model: a step the verifier can never accept is refused three times and fails the attempt", async ({ request }) => {
  const sop = await registerSop(request, `impossible${Date.now()}`, 1, ["Reply with a number that is both greater than 10 and less than 5"]);
  const taskId = await createTask(request, unique("REAL sop fail"), "Reply with one word. Do not use tools.");
  await addNodes(request, taskId, [{ type: "sop_stage", title: "Impossible", sop }]);

  await eventually(
    async () => sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.finished' AND body->'payload'->>'outcome' = 'failed'`),
    (count) => Number(count) >= 1,
    "the impossible SOP step to fail",
    220_000,
  );
  expect(sql(`SELECT string_agg(seq::text, ',' ORDER BY seq) FROM checkpoints WHERE task_id = '${taskId}' AND kind = 'sop_run_state'`)).toBe("11,12,13");
});
