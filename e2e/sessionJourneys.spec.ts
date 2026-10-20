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
async function createFromCatalog(page: Page, ref: string, marker: string, mobile = false, kind: "agent" | "team" = "agent") {
  await navigate(page, kind === "team" ? "专家团" : "专家", mobile);
  const card = page.getByRole("article").filter({ hasText: ref });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "开始对话" }).click();
  const dialog = page.getByRole("dialog", { name: "新建会话" });
  await expect(dialog.getByLabel("入口", { exact: true })).toHaveValue(`${kind}:${ref}`);
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
    await first.section.getByRole("link", { name: "查看运行" }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${first.id}$`));
    const segments = page.getByRole("table", { name: "段", exact: true }).locator("tbody tr");
    await expect(segments.first()).toBeVisible();
    await expect(segments.last()).toContainText("已完成");
    await expect.poll(async () => Number(await page.getByTestId("cost-total").getAttribute("data-millicredits"))).toBeGreaterThan(0);
    await expect(page.getByTestId("replay-timeline").getByText("mcp_test_wait_seconds", { exact: true })).toBeVisible();
    await expect(page.getByText("没有审批记录", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "← 返回会话" }).click();
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
    await first.section.getByRole("link", { name: "查看运行" }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${first.id}$`));
    const records = page.getByRole("list", { name: "审批记录", exact: true }).getByRole("listitem");
    await expect(records).toHaveCount(1); await expect(records.first()).toContainText("已解决"); await expect(records.first()).toContainText("允许一次");
    const effects = page.getByRole("table", { name: "工具副作用", exact: true }).locator("tbody tr");
    await expect(effects).toHaveCount(1); await expect(effects.first()).toContainText("已完成");
    const reasons = page.getByRole("table", { name: "段", exact: true }).locator("tbody tr td:nth-child(4)");
    await expect.poll(() => reasons.allTextContents()).toEqual(["等待工具审批", "外部写入边界", "已完成"]);
    await page.getByRole("link", { name: "← 返回会话" }).click();
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

test.describe("WJ2 team collaboration", () => {
  const sessions: string[] = []; let tenant = "";
  test.afterAll(async ({ request }) => cleanup(request, tenant, sessions));
  test("WJ2 writers, reviewer, artifacts and member replay", async ({ page, seed, recordRun }) => {
    test.setTimeout(25 * 60_000);
    tenant = seed.tenant_id; const marker = journeyMarker(2);
    await login(page); sessions.push(await createFromCatalog(page, "dev/review-team", marker, false, "team"));
    // Same J2 instruction, except /outputs: /workspace is not scanned for artifacts (WP9d step 0).
    await send(page, "Create two independent tasks, assigned to writer-1 and writer-2. Each writer must write " +
      "one short file at exactly /outputs/writer-1.txt and /outputs/writer-2.txt (not under /workspace), about safe retries and " +
      "idempotency respectively. Have reviewer inspect both files and submit verdicts. " +
      "Wait for review before calling team_finish with a summary of both deliverables.");
    const run = await currentRun(page, recordRun);
    const board = run.section.getByTestId("team-board");
    // Observe transient working state concurrently with task creation so it cannot be missed later.
    const tasks = board.locator("article[data-task-id]");
    await Promise.all([
      expect(board.getByText("工作中", { exact: true }).first()).toBeVisible({ timeout: 180_000 }),
      expect.poll(() => tasks.count(), { timeout: 180_000 }).toBeGreaterThanOrEqual(2),
    ]);
    for (const writer of ["writer-1", "writer-2"]) await expect(tasks.filter({ has: page.getByText(writer, { exact: true }) }).first()).toBeVisible({ timeout: 180_000 });
    const votes = tasks.locator("div").filter({ has: page.getByText("reviewer", { exact: true }) }).filter({ has: page.getByText(/^(通过|驳回)$/) });
    await expect.poll(() => votes.count(), { timeout: 20 * 60_000 }).toBeGreaterThan(0);
    await expect(run.section.locator("[data-run-status]")).toHaveText("已完成", { timeout: 20 * 60_000 });
    // Completed session boards collapse; reopen through the actual control.
    const panel = run.section.locator("details").filter({ has: page.locator("summary").filter({ hasText: "专家团任务板" }) }).first();
    if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) await panel.locator("summary").first().click();
    await expect(board.getByRole("heading", { name: "总结", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "文件", exact: true }).click();
    const file = page.getByRole("treeitem").filter({ hasText: /writer-[12]\.txt/ }).first();
    // Only /outputs is synced; a writer that picks another path is a model failure, not a platform one.
    await expectModel(() => expect(file).toBeVisible({ timeout: 15_000 }), "写手没有把文件写到 /outputs"); await file.click();
    await expect(page.getByTestId("file-preview")).toBeVisible();
    await expect(page.getByTestId("file-preview").locator("pre")).not.toHaveText("");
    await run.section.getByRole("link", { name: "查看运行" }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${run.id}$`));
    const segmentMembers = page.getByRole("table", { name: "段", exact: true }).locator("tbody tr td:first-child");
    for (const member of ["leader", "writer-1", "writer-2", "reviewer"]) await expect(segmentMembers.filter({ hasText: new RegExp(`^${member}$`) }).first()).toBeVisible();
    const events = page.getByTestId("replay-timeline").locator("[data-timeline-member]");
    await expect.poll(() => events.evaluateAll((elements) => new Set(elements.map((element) => element.getAttribute("data-timeline-member"))).size)).toBeGreaterThan(1);
    await page.getByRole("button", { name: "writer-1", exact: true }).click();
    await expect.poll(() => page.getByTestId("replay-timeline").locator('[data-timeline-member="writer-1"]').count()).toBeGreaterThan(0);
    expect(await events.evaluateAll((elements) => elements.every((element) => element.getAttribute("data-timeline-member") === "writer-1"))).toBe(true);
    // Summary wording and file mentions are model assertions, not platform retries.
    const summaryPanel = page.getByTestId("team-board").locator("div").filter({ has: page.getByRole("heading", { name: "总结", exact: true }) }).first();
    await expectModel(async () => {
      const text = (await summaryPanel.innerText()).replace("总结", "").trim(); expect(text.length).toBeGreaterThan(0);
      await expect(summaryPanel).toContainText("writer-1.txt"); await expect(summaryPanel).toContainText("writer-2.txt");
    }, "专家团总结未涵盖两个交付文件");
  });
});
