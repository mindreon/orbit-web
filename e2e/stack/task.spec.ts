import { expect, test } from "@playwright/test";

test("real stack creates a v3 task and renders its workflow projection", async ({ page, request }) => {
  const title = `stack task ${Date.now()}`;
  const response = await request.post("/v1/tasks", {
    data: { title, goal: "verify the v3 task stack" },
    timeout: 120_000,
  });
  expect(response.status()).toBe(201);
  const task = (await response.json()) as { task_id: string };

  await expect.poll(async () => {
    const current = await request.get(`/v1/tasks/${task.task_id}`);
    return current.ok() ? (await current.json()).status : "unavailable";
  }, { timeout: 30_000 }).toMatch(/CREATED|PLANNING|RUNNING|COMPLETED/);

  await page.goto("/tasks");
  await expect(page.getByText("任务中心")).toBeVisible();
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("计划图")).toBeVisible();
  await expect(page.getByText("task.created").first()).toBeVisible({ timeout: 30_000 });
});
