import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { test, expect, type ToolCounts } from "./fixtures";
import { expectModel, journeyMarker, login } from "./helpers";

type ReadCalls = (marker: string) => Promise<ToolCounts>;
async function modelToolStarted(readCalls: ReadCalls, marker: string) {
  let platformFailure: unknown;
  await expectModel(() => expect.poll(async () => {
    try { return (await readCalls(marker)).wait_seconds.started; }
    catch (error) { platformFailure = error; return 1; }
  }, { timeout: 120_000 }).toBeGreaterThanOrEqual(1), "专家未调用 wait_seconds");
  // A failed host endpoint/request is a platform failure, not a model retry.
  if (platformFailure) throw platformFailure;
}
async function navigate(page: Page, label: string, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: label, exact: true }).click();
}
async function createFromCatalog(page: Page, ref: string, marker: string, mobile = false) {
  await navigate(page, "专家", mobile);
  const card = page.getByRole("article").filter({ hasText: ref });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "开始对话" }).click();
  const dialog = page.getByRole("dialog", { name: "新建会话" });
  await expect(dialog.getByLabel("入口", { exact: true })).toHaveValue(`agent:${ref}`);
  await expect(dialog.getByLabel("入口类型")).toBeDisabled();
  await dialog.getByLabel("标题", { exact: true }).fill(marker);
  await dialog.getByRole("button", { name: "创建会话" }).click();
  await expect(page).toHaveURL(/\/sessions\/[^/?]+$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}
async function send(page: Page, text: string) {
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "消息", exact: true }).fill(text);
  await page.getByRole("button", { name: "发送", exact: true }).click();
}
async function currentRun(page: Page, recordRun: (id: string) => Promise<void>, previous?: string) {
  const section = page.locator("section[data-run-id]").last();
  await expect.poll(async () => section.getAttribute("data-run-id")).not.toBe(previous ?? null);
  const id = await section.getAttribute("data-run-id");
  expect(id).toBeTruthy();
  await recordRun(id!);
  return { id: id!, section: page.locator(`section[data-run-id="${id}"]`) };
}
async function complete(section: Locator) { await expect(section.getByText("已完成", { exact: true })).toBeVisible({ timeout: 180_000 }); }

/** Cleanup is preparation/teardown only, never an API assertion of page behaviour. */
async function cleanup(request: APIRequestContext, tenant: string, sessions: readonly string[]) {
  if (!sessions.length) return;
  const auth = await request.post("/v1/auth/dev/token", { data: { email: "dev@orbit.local" } });
  expect(auth.ok()).toBe(true);
  const token = await auth.json() as { access_token: string };
  const headers = { Authorization: `Bearer ${token.access_token}`, "X-Orbit-Tenant": tenant };
  for (const session of sessions) {
    let cursor: string | undefined;
    do {
      const response = await request.get(`/v1/sessions/${session}/runs`, { headers, params: { limit: 100, ...(cursor ? { cursor } : {}) } });
      expect(response.ok()).toBe(true);
      const page = await response.json() as { items: { id: string; status: string }[]; next_cursor?: string };
      for (const run of page.items) if (["queued", "running", "waiting_input", "waiting_approval", "paused"].includes(run.status)) {
        const result = await request.post(`/v1/runs/${run.id}/cancel`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } });
        if (!result.ok()) { const failure = await result.json() as { error: { code: string } }; expect(["RUN_FINISHED", "RUN_NOT_ACTIVE"]).toContain(failure.error.code); }
      }
      cursor = page.next_cursor || undefined;
    } while (cursor);
    const archive = await request.post(`/v1/sessions/${session}/archive`, { headers: { ...headers, "Idempotency-Key": crypto.randomUUID() } });
    expect(archive.ok()).toBe(true);
  }
}

test.describe("WJ1 single expert delivery", () => {
  const sessions: string[] = []; let tenant = "";
  test.afterAll(async ({ request }) => cleanup(request, tenant, sessions));
  test("WJ1 tool history survives refresh, cancellation and continued conversation", async ({ page, seed, readCalls, recordRun }) => {
    tenant = seed.tenant_id; const marker = journeyMarker(1);
    await login(page); await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("combobox", { name: /工作空间.*dev/ })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "专家", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "专家团", exact: true })).toBeVisible();
    sessions.push(await createFromCatalog(page, "dev/echo-agent", marker));
    await send(page, `Call the tool wait_seconds with seconds=15 and marker=${marker}. After it returns, reply with the single word READY.`);
    await modelToolStarted(readCalls, marker);
    const first = await currentRun(page, recordRun);
    await expect(first.section.getByText("mcp_test_wait_seconds", { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "实时", exact: true })).toBeVisible();
    await page.reload();
    await expect(first.section.getByText("mcp_test_wait_seconds", { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "实时", exact: true })).toBeVisible();
    await complete(first.section);
    await expectModel(() => expect(first.section).toContainText("READY"));
    // Replay-page assertions (step 4) belong to WP9d.
    const slow = `${marker}-cancel`;
    await send(page, `Call wait_seconds with seconds=240 and marker=${slow}. After the tool returns, reply DONE.`);
    await modelToolStarted(readCalls, slow);
    const second = await currentRun(page, recordRun, first.id);
    await expect(second.section.getByText("mcp_test_wait_seconds", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "停止", exact: true }).click();
    await expect(second.section.getByText("已取消", { exact: true })).toBeVisible({ timeout: 30_000 });
    await send(page, "Reply with the single word OK.");
    const third = await currentRun(page, recordRun, second.id);
    await complete(third.section);
    await expectModel(() => expect(third.section).toContainText("OK"));
  });
});

async function approveJourney(page: Page, readCalls: ReadCalls, marker: string, recordRun: (id: string) => Promise<void>, mobile: boolean) {
  await send(page, `Use the notify_send tool exactly once with to="ops" and text="deploy ${marker}". After it succeeds, reply with the single word DONE.`);
  await expect(page.getByText("工具审批", { exact: true })).toBeVisible({ timeout: 120_000 });
  const run = await currentRun(page, recordRun);
  await expect(run.section.getByText("等待审批", { exact: true })).toBeVisible();
  const sessionUrl = page.url();
  await navigate(page, "收件箱", mobile);
  const item = page.locator(`section[data-run-id="${run.id}"]`);
  await expect(item).toBeVisible();
  await expect(item.getByRole("link", { name: /在会话中查看/ })).toHaveAttribute("href", /\/sessions\//);
  if (mobile) {
    expect(await item.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const button = item.getByRole("button", { name: "允许一次", exact: true });
    await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport();
    const box = await button.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await item.getByRole("button", { name: "允许一次", exact: true }).click();
  await expect(item).toHaveCount(0);
  await page.goto(sessionUrl);
  await expect(run.section.getByText(/已由 你.*处理：允许一次/)).toBeVisible();
  await complete(run.section);
  await expect.poll(async () => (await readCalls(marker)).notify_send).toEqual({ started: 1, finished: 1 });
  expect((await readCalls(marker)).notify_send.started).toBeLessThanOrEqual(1);
  return run;
}

test.describe("WJ3 tool approval", () => {
  const sessions: string[] = []; let tenant = "";
  test.afterAll(async ({ request }) => cleanup(request, tenant, sessions));
  test("WJ3 allow once in inbox, then deny in the conversation", async ({ page, seed, readCalls, recordRun }) => {
    tenant = seed.tenant_id; const marker = journeyMarker(3);
    await login(page); sessions.push(await createFromCatalog(page, "dev/notify-agent", marker));
    const first = await approveJourney(page, readCalls, marker, recordRun, false);
    // Step 4's replay-page assertions are deliberately left to WP9d.
    const denied = journeyMarker(3);
    await send(page, `Use the notify_send tool exactly once with to="ops" and text="deploy ${denied}". If denied, do not retry; reply with the single word DONE.`);
    await expect(page.getByText("工具审批", { exact: true })).toBeVisible({ timeout: 120_000 });
    const second = await currentRun(page, recordRun, first.id);
    await second.section.getByRole("button", { name: "拒绝", exact: true }).click();
    await second.section.getByLabel("拒绝说明").fill("本旅程不允许此次外部操作");
    await second.section.getByRole("button", { name: "确认拒绝", exact: true }).click();
    await complete(second.section);
    await expect(second.section.locator("details").filter({ has: page.locator("summary").filter({ hasText: "mcp_notify_notify_send" }) }).getByText("失败", { exact: true })).toBeVisible();
    expect((await readCalls(denied)).notify_send.started).toBe(0);
    await navigate(page, "收件箱", false);
    await expect(page.locator(`section[data-run-id="${second.id}"]`)).toHaveCount(0);
  });
  test("WJ3 step 6 approval through the phone drawer @mobile", async ({ page, seed, readCalls, recordRun }) => {
    tenant = seed.tenant_id; const marker = journeyMarker(3);
    await login(page); sessions.push(await createFromCatalog(page, "dev/notify-agent", marker, true));
    await approveJourney(page, readCalls, marker, recordRun, true);
  });
});
