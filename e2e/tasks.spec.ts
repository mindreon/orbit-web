import { expect, test } from "@playwright/test";

test("task desk creates a task, renders its plan and sends an interrupt", async ({ page }) => {
  const task = {
    task_id: "task_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    tenant_id: "tenant-a",
    workflow_id: "task/tenant-a/demo",
    title: "部署报告",
    goal: "检查生产部署",
    mode: "single",
    status: "RUNNING",
    profile: "default@1",
    plan_version: 1,
    created_by: "user-a",
    created_at: "2026-09-29T00:00:00Z",
    updated_at: "2026-09-29T00:00:00Z",
    budgets: {},
    usage: {},
  };
  const plan = {
    plan_version: 1,
    hash: `sha256:${"0".repeat(64)}`,
    nodes: [{ node_id: `n_${"0".repeat(26)}`, type: "agent_turn", title: "探索", status: "RUNNING", depends_on: [], workspace_access: "write", owner_profile: "default@1", frozen: false, attempt_count: 1 }],
    edges: [],
  };
  let events = [{ seq: 1, event_id: "evt_01ARZ3NDEKTSV4RRFFQ69G5FAW", task_id: task.task_id, type: "task.created", source: "workflow", payload: {}, occurred_at: task.created_at }];
  await page.route("**/v1/tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v1/tasks") return route.fulfill({ json: { items: [task] } });
    if (request.method() === "POST" && url.pathname === "/v1/tasks") return route.fulfill({ status: 201, json: task });
    if (url.pathname.endsWith("/plan")) return route.fulfill({ json: plan });
    if (url.pathname.endsWith("/events")) {
      return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: events.map((event) => `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`).join("") });
    }
    if (request.method() === "GET") return route.fulfill({ json: task });
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { delivery?: string };
      events = [...events, { seq: events.length + 1, event_id: `evt_${events.length + 1}`, task_id: task.task_id, type: body.delivery === "interrupt" ? "message.user" : "task.status_changed", source: "control", payload: body, occurred_at: task.created_at }];
      return route.fulfill({ status: 202, json: { accepted: true } });
    }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto("/");
  await page.getByRole("link", { name: "部署报告" }).click();
  await expect(page.getByRole("heading", { name: "部署报告" })).toBeVisible();
  await expect(page.getByText("探索")).toBeVisible();
  await page.getByPlaceholder("向任务发送消息").fill("立即停止当前执行");
  await page.getByPlaceholder("向任务发送消息").press("Control+Enter");
  await page.getByText(/事件日志/).click();
  await expect(page.getByText("task.created")).toBeVisible();
});
