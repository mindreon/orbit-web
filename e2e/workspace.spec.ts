/**
 * WorkBuddy 式工作台：首页创建任务、对话里的产物卡片和右侧预览、嵌入态的任务栏。
 *
 * Ways this can fail (each is asserted below):
 *   N1 Enter on the home composer does not create the task, or the title is not the first line of the goal
 *   N2 Shift+Enter sends instead of adding a new line
 *   N3 an artifact card does not open a preview tab, or the HTML preview is not sandboxed
 *   N4 embedded, the task list disappears together with the sidebar
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ATTEMPT_ID = "att_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const NOW = "2026-09-29T00:00:00Z";

const task = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理周报",
  goal: "整理本周周报\n并给出摘要",
  mode: "single",
  status: "COMPLETED",
  profile: "default@1",
  plan_version: 1,
  created_by: "user-a",
  created_at: NOW,
  updated_at: NOW,
  budgets: {},
  usage: {},
};

const event = (seq: number, type: string, payload: Record<string, unknown>) => ({ seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: NOW });

async function mockBackend(page: Page, created: { titles: string[] }) {
  await page.route("**/v1/profiles", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/v1/tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v1/tasks") return route.fulfill({ json: { items: [task] } });
    if (request.method() === "POST" && url.pathname === "/v1/tasks") {
      created.titles.push((request.postDataJSON() as { title: string }).title);
      return route.fulfill({ status: 201, json: task });
    }
    if (url.pathname.endsWith("/plan")) return route.fulfill({ json: { plan_version: 1, hash: `sha256:${"0".repeat(64)}`, nodes: [], edges: [] } });
    if (url.pathname.endsWith("/artifacts")) {
      const entry = (name: string, mediaType: string) => ({ name, media_type: mediaType, size_bytes: 64, blob_ref: "sha256:x" });
      return route.fulfill({ json: { items: [{ manifest_id: "man_1", task_id: TASK_ID, attempt_id: ATTEMPT_ID, entries: [entry("report.md", "text/markdown"), entry("slides.html", "text/html")], created_at: NOW }] } });
    }
    if (url.pathname.endsWith("/events")) {
      const events = [
        event(1, "task.created", { goal: task.goal, title: task.title }),
        event(2, "attempt.started", { attempt_id: ATTEMPT_ID, node_id: "n_1", attempt_no: 1, profile: "default@1" }),
        event(3, "message.agent_final", { attempt_id: ATTEMPT_ID, text: "周报已经整理好。" }),
        event(4, "attempt.finished", { attempt_id: ATTEMPT_ID, node_id: "n_1", outcome: "completed" }),
      ];
      return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: events.map((item) => `id: ${item.seq}\ndata: ${JSON.stringify(item)}\n\n`).join("") });
    }
    return route.fulfill({ json: task });
  });
  await page.route("**/v1/artifacts/man_1/url**", (route) => route.fulfill({ json: { url: `http://artifacts.test/${new URL(route.request().url()).searchParams.get("name")}` } }));
  await page.route("http://artifacts.test/**", (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, contentType: "text/plain", body: name.endsWith(".html") ? "<h1>幻灯片第一页</h1>" : "# 周报标题\n\n本周完成三件事。" });
  });
}

test("home composer: Enter creates the task and the title is the first line; Shift+Enter adds a line", async ({ page }) => {
  const created = { titles: [] as string[] };
  await mockBackend(page, created);
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "任务目标" });
  await box.fill("整理本周周报");
  await box.press("Shift+Enter");
  await box.pressSequentially("并给出摘要");
  await expect(box).toHaveValue("整理本周周报\n并给出摘要");
  expect(created.titles).toEqual([]);
  await box.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/tasks/${TASK_ID}$`));
  expect(created.titles).toEqual(["整理本周周报"]);
  await expect(page.getByRole("heading", { name: "整理周报" })).toBeVisible();
});

test("artifact cards open a preview tab; HTML runs in a sandbox", async ({ page }) => {
  await mockBackend(page, { titles: [] });
  await page.goto(`/tasks/${TASK_ID}`);
  await expect(page.getByTestId("final-output")).toContainText("周报已经整理好。");
  await expect(page.getByTestId("user-message")).toContainText("整理本周周报");

  await page.getByRole("button", { name: /report\.md/ }).first().click();
  await expect(page.getByTestId("artifact-preview")).toContainText("周报标题");
  await expect(page.getByRole("button", { name: "关闭 report.md" })).toBeVisible();

  await page.getByRole("button", { name: /slides\.html/ }).first().click();
  const frame = page.locator('iframe[title="slides.html"]');
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[title="slides.html"]').getByRole("heading", { name: "幻灯片第一页" })).toBeVisible();

  await page.getByRole("button", { name: "关闭 slides.html" }).click();
  await page.getByRole("button", { name: "关闭 report.md" }).click();
  await expect(page.getByTestId("panel-home")).toBeVisible();
});

test("embedded: the task list stays reachable without our sidebar", async ({ page }) => {
  await mockBackend(page, { titles: [] });
  await page.addInitScript(() => {
    Object.assign(window, { $wujie: { bus: { $emit: () => undefined, $on: () => undefined, $off: () => undefined } } });
  });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
  const rail = page.getByRole("complementary", { name: "任务栏" });
  await expect(rail.getByRole("link", { name: "新建任务" })).toBeVisible();
  await rail.getByRole("link", { name: "整理周报" }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${TASK_ID}$`));
});
