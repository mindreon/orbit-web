import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { expectModel, journeyMarker, login } from "./helpers";
async function authorHeaders(request: APIRequestContext, tenant: string) {
  const response = await request.post("/v1/auth/dev/token", { data: { email: "dev@orbit.local" } }); expect(response.ok()).toBe(true);
  const auth = await response.json() as { access_token: string };
  return { Authorization: `Bearer ${auth.access_token}`, "X-Orbit-Tenant": tenant, "Idempotency-Key": crypto.randomUUID() };
}
test.describe("WJ4 schedules", () => {
  let tenant = ""; const ids = new Set<string>(); const sessions = new Set<string>();
  test.afterAll(async ({ request }) => {
    if (!tenant) return; const headers = await authorHeaders(request, tenant);
    for (const id of ids) {
      const response = await request.get(`/v1/schedules/${id}`, { headers });
      if (response.ok()) {
        const detail = await response.json() as { runs: { run_id?: string; session_id?: string }[] };
        for (const run of detail.runs ?? []) if (run.session_id) sessions.add(run.session_id);
        const removed = await request.delete(`/v1/schedules/${id}`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } }); expect(removed.ok()).toBe(true);
      } else expect(response.status()).toBe(404);
    }
    for (const session of sessions) {
      let cursor: string | undefined;
      do {
        const response = await request.get(`/v1/sessions/${session}/runs`, { headers, params: { limit: 100, ...(cursor ? { cursor } : {}) } }); expect(response.ok()).toBe(true);
        const page = await response.json() as { items: { id: string; status: string }[]; next_cursor?: string };
        for (const run of page.items) if (["queued", "running", "waiting_input", "waiting_approval", "paused"].includes(run.status)) {
          const cancelled = await request.post(`/v1/runs/${run.id}/cancel`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } });
          if (!cancelled.ok()) { const failure = await cancelled.json() as { error: { code: string } }; expect(["RUN_FINISHED", "RUN_NOT_ACTIVE"]).toContain(failure.error.code); }
        }
        cursor = page.next_cursor || undefined;
      } while (cursor);
      const archived = await request.post(`/v1/sessions/${session}/archive`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } }); expect(archived.ok()).toBe(true);
    }
  });
  test("WJ4 steps 1–5 create, validate, run, pause, resume and delete", async ({ page, seed, recordRun }) => {
    tenant = seed.tenant_id; const marker = journeyMarker(4);
    // Capture IDs even if an assertion fails immediately after a successful create.
    page.on("response", async (response) => {
      if (response.request().method() === "POST" && new URL(response.url()).pathname === "/v1/schedules" && response.ok()) { const saved = await response.json() as { id: string }; ids.add(saved.id); }
      if (response.request().method() === "GET" && /\/v1\/schedules\/[^/]+$/.test(new URL(response.url()).pathname) && response.ok()) {
        const detail = await response.json() as { runs?: { session_id?: string }[] }; for (const run of detail.runs ?? []) if (run.session_id) sessions.add(run.session_id);
      }
    });
    await login(page); await page.goto("/schedules/new");
    await page.getByLabel("名称", { exact: true }).fill(marker);
    // Native optgroups are not exposed as ARIA groups in Chromium; check the grouping in the DOM.
    await expect(page.getByLabel("入口", { exact: true }).locator('optgroup[label="专家"] > option[value="agent:dev/echo-agent"]')).toBeAttached();
    await page.getByLabel("入口", { exact: true }).selectOption("agent:dev/echo-agent");
    await page.getByLabel("提示词").fill("Reply with the single word READY."); await page.getByLabel("cron", { exact: true }).fill("*/1 * * * *");
    await page.getByLabel("时区", { exact: true }).selectOption("Asia/Shanghai"); await page.getByLabel("预算（积分）").fill("100");
    await expect(page.getByText("100000 millicredits", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "创建定时任务", exact: true }).click();
    await expect(page.getByText("触发间隔不能短于 5 分钟", { exact: true })).toBeVisible();
    await expect(page.getByLabel("cron", { exact: true })).toBeFocused();
    await page.getByLabel("cron", { exact: true }).fill("0 3 * * *"); await page.getByRole("button", { name: "创建定时任务", exact: true }).click();
    await expect(page).toHaveURL(/\/schedules\/(?!new$)[^/]+$/); const id = new URL(page.url()).pathname.split("/").pop()!; ids.add(id);
    await expect.poll(async () => { await page.getByRole("button", { name: "刷新", exact: true }).click(); return page.locator("dt").filter({ hasText: /^下次触发$/ }).locator("..").locator("dd").textContent(); }, { timeout: 30000 }).not.toBe("—");
    await page.getByRole("button", { name: "立即运行", exact: true }).click();
    const table = page.getByRole("table", { name: "最近运行", exact: true });
    await expect.poll(async () => { await page.getByRole("button", { name: "刷新", exact: true }).click(); return table.locator("tbody tr").count(); }, { timeout: 60000 }).toBeGreaterThan(0);
    await expect.poll(async () => { await page.getByRole("button", { name: "刷新", exact: true }).click(); return table.locator("tbody tr").first().innerText(); }, { timeout: 60000 }).toContain("已完成");
    const runHref = await table.getByRole("link", { name: "查看运行" }).first().getAttribute("href"); await recordRun(runHref!.split("/").pop()!);
    const sessionHref = await table.getByRole("link", { name: "查看会话" }).first().getAttribute("href"); sessions.add(sessionHref!.split("/").pop()!);
    await table.getByRole("link", { name: "查看会话" }).first().click();
    await expectModel(() => expect(page.locator("section[data-run-id]")).toContainText("READY", { timeout: 60000 }));
    await page.goto(`/schedules/${id}`); await page.getByRole("button", { name: "暂停", exact: true }).click(); await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "恢复", exact: true }).click(); await expect(page.getByText("启用", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "删除", exact: true }).click(); await page.getByRole("dialog", { name: "确认操作" }).getByRole("button", { name: "确认", exact: true }).click();
    await expect(page).toHaveURL(/\/schedules$/); await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
  });
});
test.describe("WJ5 reviewer preparation", () => {
  let tenant = ""; let email = "";
  test.afterAll(async ({ request }) => {
    if (!tenant || !email) return; const headers = await authorHeaders(request, tenant); let cursor: string | undefined;
    do {
      const response = await request.get("/v1/admin/members", { headers, params: { limit: 100, ...(cursor ? { cursor } : {}) } }); expect(response.ok()).toBe(true);
      const page = await response.json() as { items: { principal: { id: string; email: string } }[]; next_cursor?: string };
      const reviewer = page.items.find((item) => item.principal.email === email);
      if (reviewer) { const result = await request.patch(`/v1/admin/members/${reviewer.principal.id}`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { status: "suspended" } }); expect(result.ok()).toBe(true); return; }
      cursor = page.next_cursor || undefined;
    } while (cursor);
  });
  test("WJ5 steps 1–3 reviewer is provisioned, promoted and sees review navigation", async ({ page, browser, seed }) => {
    tenant = seed.tenant_id; email = `wj5-reviewer-${journeyMarker(5)}@orbit.local`;
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL }); const reviewer = await context.newPage();
    try {
      await login(reviewer, email); await expect(reviewer).toHaveURL(/\/sessions$/);
      const nav = reviewer.getByRole("navigation", { name: "主导航" });
      await expect(nav.getByRole("link", { name: "审核", exact: true })).toHaveCount(0); await expect(nav.getByRole("link", { name: "管理", exact: true })).toHaveCount(0);
      await expect(reviewer.getByText(/租户|组织|邀请/)).toHaveCount(0);
      await login(page); await page.goto("/admin/members"); await page.getByLabel("按邮箱或显示名过滤").fill(email);
      const row = page.getByRole("table", { name: "成员", exact: true }).locator("tbody tr").filter({ hasText: email });
      // Member tables are explicitly paged; find newly provisioned accounts beyond the first page as well.
      while (!(await row.count())) {
        await expect(page.getByRole("button", { name: "正在加载…", exact: true })).toHaveCount(0);
        if (await row.count()) break;
        const more = page.getByRole("button", { name: "加载更多", exact: true });
        if (!(await more.isVisible())) break;
        await more.click();
        await expect(page.getByRole("button", { name: "正在加载…", exact: true })).toHaveCount(0);
      }
      await expect(row).toContainText("成员"); await row.getByRole("button", { name: `${email}操作` }).click(); await page.getByRole("menuitem", { name: "改角色", exact: true }).click();
      const dialog = page.getByRole("dialog"); await dialog.getByLabel("角色", { exact: true }).selectOption("tenant.reviewer"); await dialog.getByRole("button", { name: "保存", exact: true }).click(); await expect(row).toContainText("审核员");
      await reviewer.reload(); await expect(nav.getByRole("link", { name: "审核", exact: true })).toBeAttached(); await expect(nav.getByRole("link", { name: "专家", exact: true })).toBeAttached(); await expect(nav.getByRole("link", { name: "专家团", exact: true })).toBeAttached(); await expect(nav.getByRole("link", { name: "管理", exact: true })).toHaveCount(0);
    } finally { await context.close(); }
  });
});
