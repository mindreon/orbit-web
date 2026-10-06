import { expect, test } from "@playwright/test";
import { enableDeveloperMode } from "../helpers";

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

  await enableDeveloperMode(page);
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "开发者视图" }).click();
  await expect(page.getByRole("region", { name: "计划图" })).toBeVisible();
  // 事件日志默认折叠，行还在页面里。
  await expect(page.getByText("task.created").first()).toBeAttached({ timeout: 30_000 });
});
