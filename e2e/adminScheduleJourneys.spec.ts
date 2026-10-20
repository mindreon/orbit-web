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
test.describe("WJ5 asset publishing", () => {
  let tenant = ""; let email = ""; const assets = new Set<string>(); const installs = new Set<string>();
  test.afterAll(async ({ request }) => {
    if (!tenant) return; const headers = await authorHeaders(request, tenant);
    for (const id of installs) { const result = await request.delete(`/v1/installs/${id}`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } }); expect(result.ok() || result.status() === 404).toBe(true); }
    for (const id of assets) { const result = await request.delete(`/v1/assets/${id}`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } }); expect(result.ok()).toBe(true); }
    if (!email) return; let cursor: string | undefined;
    do {
      const response = await request.get("/v1/admin/members", { headers, params: { limit: 100, ...(cursor ? { cursor } : {}) } }); expect(response.ok()).toBe(true);
      const page = await response.json() as { items: { principal: { id: string; email: string } }[]; next_cursor?: string };
      const reviewer = page.items.find((item) => item.principal.email === email);
      if (reviewer) { const result = await request.patch(`/v1/admin/members/${reviewer.principal.id}`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() }, data: { status: "suspended" } }); expect(result.ok()).toBe(true); return; }
      cursor = page.next_cursor || undefined;
    } while (cursor);
  });
  test("WJ5 steps 1–12 provision reviewer, publish, diff, rollback and reference MCP", async ({ page, browser, seed }) => {
    tenant = seed.tenant_id; const marker = crypto.randomUUID().slice(0, 8); email = `wj5-reviewer-${marker}@orbit.local`;
    // Capture cleanup IDs immediately after writes, even if the following UI assertion fails.
    page.on("response", async (response) => {
      if (!response.ok() || response.request().method() !== "POST") return;
      const path = new URL(response.url()).pathname;
      if (path === "/v1/assets") { const saved = await response.json() as { id: string }; assets.add(saved.id); }
      if (/\/installs$/.test(path)) { const saved = await response.json() as { id: string }; installs.add(saved.id); }
    });
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
      const create = async (kind: "专家" | "MCP 服务", name: string) => {
        await page.goto("/assets/new"); await page.getByRole("radio", { name: new RegExp(`^${kind}\\s`) }).check(); await page.getByLabel("名称", { exact: true }).fill(name); await page.getByRole("radio", { name: "全员可见", exact: true }).check();
        const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/v1/assets" && r.request().method() === "POST");
        await page.getByRole("button", { name: "创建资产", exact: true }).click(); const saved = await (await response).json() as { id: string; publisher: string; name: string }; assets.add(saved.id);
        await expect(page).toHaveURL(new RegExp(`/assets/${saved.id}$`)); return saved;
      };
      const upload = async (version: string) => {
        await page.getByLabel("版本号", { exact: true }).fill(version); await page.getByRole("button", { name: "上传版本", exact: true }).click(); await expect(page).toHaveURL(/\/assets\/[^/]+\/versions\/(?!new)[^/]+$/);
        await expect(page.getByRole("heading", { name: `版本 ${version}`, exact: true })).toBeVisible(); return page.url();
      };
      const submitAndApprove = async (assetName: string, version: string, summary: string) => {
        await page.getByRole("button", { name: "提交", exact: true }).click(); const submit = page.getByRole("dialog", { name: "提交版本" }); await submit.getByLabel("发布通道").selectOption("stable"); await submit.getByRole("button", { name: "提交", exact: true }).click();
        await expect(page.getByRole("button", { name: "撤回", exact: true })).toBeVisible(); await expect(page.getByText("待审核", { exact: true }).first()).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole("heading", { name: "检查报告", exact: true })).toBeVisible();
        for (const name of ["结构", "兼容性", "密钥声明", "静态检查", "注入检查", "权限变化"]) await expect(page.getByText(name, { exact: false }).last()).toBeVisible();
        await reviewer.goto("/reviews"); const row = reviewer.getByRole("table", { name: "待审核版本", exact: true }).locator("tbody tr").filter({ hasText: assetName }); await expect(row).toContainText("专家"); await expect(row).toContainText(version); await row.getByRole("link", { name: version, exact: true }).click();
        // The uploader cannot decide on their own version while it is in review.
        await page.goto(new URL(reviewer.url()).pathname); await expect(page.getByText("不能审核自己的资产", { exact: true })).toBeVisible(); for (const name of ["通过", "要求修改", "拒绝"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
        await expect(reviewer.getByLabel("审核意见")).toHaveAttribute("maxlength", "4000");
        await expect(reviewer.getByRole("heading", { name: summary, exact: true })).toBeVisible(); await expect(reviewer.getByRole("heading", { name: "检查报告", exact: true })).toBeVisible(); await expect(reviewer.getByRole("heading", { name: "权限对比", exact: true })).toBeVisible();
        await reviewer.getByLabel("审核意见").fill(`WJ5 ${version} reviewed`); await reviewer.getByRole("button", { name: "通过", exact: true }).click(); await reviewer.getByRole("dialog", { name: "确认操作" }).getByRole("button", { name: "确认", exact: true }).click();
        await expect(reviewer.getByText("审核决定已提交", { exact: true })).toBeVisible(); await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible({ timeout: 60000 });
      };
      // 4–8: create from the exact echo-agent template and independently publish it.
      const expert = await create("专家", `wj5-${marker}`); await page.getByRole("button", { name: "新版本", exact: true }).first().click(); const first = await upload("1.0.0"); const firstId = first.split("/").pop()!;
      await expect(page.getByRole("heading", { name: "技能与 MCP", exact: true })).toBeVisible(); await expect(page.getByText("test", { exact: true })).toBeVisible(); await expect(page.getByText("testmcp:8000", { exact: true })).toBeVisible(); await expect(page.getByText("直连，不是资产", { exact: true })).toBeVisible(); await expect(page.getByText("随专家打包", { exact: true })).toHaveCount(0);
      await submitAndApprove(expert.name, "1.0.0", "新增 3 个文件 · 修改 0 个 · 删除 0 个");
      const stable = async (version: string) => { await page.goto(`/assets/${expert.id}`); await page.getByRole("tab", { name: "通道", exact: true }).click(); const row = page.getByRole("table", { name: "通道", exact: true }).locator("tbody tr").filter({ hasText: "stable" }); await expect(row).toContainText(version); return row; };
      await stable("1.0.0");
      // Naked URL must work without router state or an asset query hint.
      await page.goto(`/reviews/${firstId}`); await expect(page.getByText("该版本已发布，审核已结束", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "通过", exact: true })).toHaveCount(0);
      await page.goto("/experts"); await page.getByLabel("搜索专家").fill(expert.name); const card = page.locator("article").filter({ hasText: expert.name }); await expect(card.getByRole("link", { name: "开始对话", exact: true })).toBeVisible();
      // 9: change a file on the 1.0.0 base, publish 1.0.1, then rollback stable.
      await page.goto(`/assets/${expert.id}/versions/new?from=${firstId}`); await expect(page.getByText("基于 1.0.0", { exact: true })).toBeVisible();
      const fileSelect = page.getByLabel("选择文件", { exact: true}); if (await fileSelect.isVisible()) await fileSelect.selectOption("AGENTS.md"); else await page.getByRole("list", { name: "版本文件" }).getByRole("button", { name: /AGENTS\.md/ }).click();
      const original = await page.getByLabel("文件内容").inputValue(); await page.getByLabel("文件内容").fill(original + "\nKeep replies concise.\n"); await upload("1.0.1"); await submitAndApprove(expert.name, "1.0.1", "新增 0 个文件 · 修改 1 个 · 删除 0 个");
      const stableRow = await stable("1.0.1"); await stableRow.getByRole("button", { name: "操作", exact: true }).click(); await page.getByRole("menuitem", { name: "回滚到此版本", exact: true }).click(); const rollback = page.getByRole("dialog", { name: "回滚通道", exact: true }); await rollback.getByLabel("版本", { exact: true }).selectOption(firstId); await rollback.getByRole("button", { name: "回滚到此版本", exact: true }).click(); await expect(stableRow).toContainText("1.0.0");
      // 10: standalone MCP draft and the expert's asset reference/reverse reference.
      const mcp = await create("MCP 服务", `wj5-mcp-${marker}`); await page.getByRole("button", { name: "新版本", exact: true }).first().click(); await expect(page.getByLabel("文件内容")).toContainText("mcpServers"); await upload("1.0.0");
      await page.goto(`/assets/${expert.id}/versions/new?from=${firstId}`); await page.getByLabel("版本号", { exact: true }).fill("1.0.2");
      const mcpSelect = page.getByLabel("选择文件", { exact: true }); if (await mcpSelect.isVisible()) await mcpSelect.selectOption("mcp.json"); else await page.getByRole("list", { name: "版本文件" }).getByRole("button", { name: /mcp\.json/ }).click();
      const config = JSON.parse(await page.getByLabel("文件内容").inputValue()) as { mcpServers: Record<string, unknown> }; config.mcpServers.catalog = { ref: `${mcp.publisher}/${mcp.name}@^1.0` }; await page.getByLabel("文件内容").fill(JSON.stringify(config, null, 2)); await upload("1.0.2"); await expect(page.getByText("草稿", { exact: true }).first()).toBeVisible();
      await page.getByRole("link", { name: `${mcp.publisher}/${mcp.name}`, exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/assets/${mcp.id}$`)); await page.getByRole("tab", { name: "被哪些专家使用", exact: true }).click(); await expect(page.getByRole("link", { name: expert.name, exact: true })).toBeVisible(); await expect(page.getByText("1.0.2（草稿）", { exact: true })).toBeVisible();
      // 11: install the published stable version; the independent WJ5 also covers its catalog badge.
      await page.goto(`/assets/${expert.id}`); await page.getByRole("tab", { name: "安装", exact: true }).click(); await page.getByRole("button", { name: "安装", exact: true }).click(); await expect(page.getByText("已安装", { exact: true })).toBeVisible();
      await page.goto("/experts"); await page.getByLabel("搜索专家").fill(expert.name); await expect(page.locator("article").filter({ hasText: expert.name }).getByText("已安装", { exact: true })).toBeVisible();
    } finally { await context.close(); }
  });
});
