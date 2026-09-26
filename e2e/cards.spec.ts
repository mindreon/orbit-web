/**
 * Tool rows, failure cards, approval and question cards with events the mock model cannot produce on demand
 * (turn.failed, sub-agent paths, parallel asks, questions). Complements e2e/stack/conversation.spec.ts.
 *
 * Ways this can fail (each is asserted below):
 *   T1 consecutive same-kind calls do not fold into one expandable group.
 *   T2 the four states are not all distinguishable: 运行中 / 成功 / 失败 / 已拒绝.
 *   T3 a running call does not read 「正在…」, or a raw tool name / JSON shows outside the collapsed details.
 *   T4 turn.failed shows the event's own message instead of the fixed copy for its errorCode.
 *   T5 重试 appears for a non-retryable code (auth), or retry reuses the failed turnId.
 *   T6 any card offers 「重新批准」.
 *   T7 two parallel asks share one card, or a sub-agent's card does not say which sub-agent.
 *   T8 a question card is not placed in the conversation, or stays editable after it was answered.
 */
import { expect, test } from "@playwright/test";
import { activity, control, emit, log, metrics, openRoom, shot, toolRows } from "./helpers";

test.beforeEach(async ({ request }) => {
  await control(request, "/__test/clear");
});

const call = (callId: string, toolName: string, args: string, extra: Record<string, unknown> = {}) =>
  activity(`ev-${callId}`, 0, { type: "tool.call", toolName, callId, turnId: "tn-1", argsPreview: args, ...extra });
const result = (callId: string, toolName: string, toolState: string, extra: Record<string, unknown> = {}) =>
  activity(`ev-${callId}-r`, 0, { type: "tool.result", toolName, callId, turnId: "tn-1", toolState, text: toolState === "success" ? "ok" : "no", ...extra });

test("same-kind calls group, four states read clearly, turn.failed copy and retry follow the errorCode", { tag: ["@acc-2", "@acc-12"] }, async ({ page, request }) => {
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "user", text: "把三份材料读一下再处理", turnId: "tn-1" })],
  });
  await openRoom(page, request);
  await emit(request, [
    { data: call("r1", "view_text_file", '{"file_path": "/w/销售数据.xlsx"}') },
    { data: result("r1", "view_text_file", "success") },
    { data: call("r2", "view_text_file", '{"file_path": "/w/合同.docx"}') },
    { data: result("r2", "view_text_file", "success") },
    { data: call("r3", "view_text_file", '{"file_path": "/w/报价单.pdf"}') },
    { data: result("r3", "view_text_file", "success") },
    { data: call("s1", "execute_shell_command", '{"command": "rm -rf build"}') },
    { data: result("s1", "execute_shell_command", "error") },
    { data: call("w1", "write_text_file", '{"file_path": "/w/报告.md"}') },
    { data: result("w1", "write_text_file", "denied", { errorCode: "APPROVAL_REJECTED" }) },
    { data: call("v1", "view_text_file", '{"file_path": "/w/附件.xlsx"}') },
  ]);

  const group = page.getByTestId("tool-group").filter({ hasText: "读取 3 个文件" });
  await expect(group).toHaveCount(1); // T1
  await expect(group.getByTestId("tool-row")).toHaveCount(0);
  await group.locator("button").first().click();
  await expect(group.getByTestId("tool-row")).toHaveCount(3);

  const states = await toolRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-state")));
  expect(new Set(states)).toEqual(new Set(["success", "failed", "rejected", "running"])); // T2
  for (const [state, label] of [["success", "成功"], ["failed", "失败"], ["rejected", "已拒绝"], ["running", "运行中"]]) {
    await expect(page.locator(`[data-testid="tool-row"][data-state="${state}"]`).first()).toContainText(label);
  }
  const running = page.locator('[data-testid="tool-row"][data-state="running"]');
  await expect(running).toContainText(/正在读取\s*附件\.xlsx/); // T3
  const visible = await page.getByTestId("chat-scroll").innerText();
  expect(visible).not.toMatch(/view_text_file|execute_shell_command|write_text_file|\{"/);
  await shot(page, "tool-states-and-group");

  // T4 + T5: a retryable failure, then a non-retryable one.
  await emit(request, [
    { data: activity("ev-f1", 0, { type: "turn.failed", turnId: "tn-1", failure: { turnId: "tn-1", agentId: "main", errorCode: "rate_limited", retryable: true, message: "provider said 429 at 10.0.0.3" } }) },
    { data: activity("ev-u2", 0, { type: "assistant.message", role: "user", text: "换个模型再试", turnId: "tn-2" }) },
    { data: activity("ev-f2", 0, { type: "turn.failed", turnId: "tn-2", failure: { turnId: "tn-2", agentId: "main", errorCode: "auth", retryable: true, message: "invalid key sk-xxx" } }) },
  ]);
  const cards = page.getByTestId("failure-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("模型服务现在太忙，这一轮被限流了。");
  await expect(cards.nth(1)).toContainText("模型服务的凭据无效或已过期");
  await expect(page.getByTestId("chat-scroll")).not.toContainText("provider said 429"); // T4
  await expect(page.getByTestId("chat-scroll")).not.toContainText("sk-xxx");
  await expect(cards.nth(0).getByRole("button", { name: "重试" })).toBeVisible();
  await expect(cards.nth(1).getByRole("button", { name: "重试" })).toHaveCount(0); // T5
  await expect(page.getByText("重新批准")).toHaveCount(0); // T6

  await cards.nth(0).getByRole("button", { name: "重试" }).click();
  await expect.poll(async () => (await log(request)).posts.length).toBe(1);
  const [retry] = (await log(request)).posts;
  expect(retry.message).toBe("把三份材料读一下再处理");
  expect(retry.turnId).toMatch(/^tn_web_/);
  expect(retry.turnId).not.toBe("tn-1");
  await metrics({ toolStates: states, retryPost: { message: retry.message, newTurnId: retry.turnId !== "tn-1" } });
  await shot(page, "failure-cards");
});

test("parallel asks get one card each, sub-agent cards say which sub-agent, questions stay in place", { tag: ["@acc-3"] }, async ({ page, request }) => {
  await control(request, "/__test/approvals", {
    items: [
      { id: "ap-1", roomId: "room-e2e", approvalRequestId: "ar-1", toolName: "execute_shell_command", status: "pending", createdAt: "2026-09-26T08:00:10Z" },
      { id: "ap-2", roomId: "room-e2e", approvalRequestId: "ar-2", toolName: "write_text_file", status: "pending", createdAt: "2026-09-26T08:00:11Z" },
    ],
  });
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "user", text: "清理构建并写报告", turnId: "tn-1" })],
  });
  await openRoom(page, request);
  await emit(request, [
    { data: activity("ev-a1", 0, { type: "approval.asked", turnId: "tn-1", callId: "c1", approvalRequestId: "ar-1", toolName: "execute_shell_command", argsPreview: '{"command": "rm -rf build"}', risk: "destructive" }) },
    { data: activity("ev-a2", 0, { type: "approval.asked", turnId: "tn-1", callId: "c2", approvalRequestId: "ar-2", toolName: "write_text_file", argsPreview: '{"file_path": "/w/报告.md"}', agentId: "researcher", agentPath: "main/researcher" }) },
    { data: activity("ev-a2c", 0, { type: "approval.asked", approvalId: "ap-2", toolName: "write_text_file", reason: "tool requires confirmation", source: "control" }) },
    { data: activity("ev-q1", 0, { type: "question.asked", turnId: "tn-1", agentId: "researcher", agentPath: "main/researcher", question: { questionId: "q1", text: "报告用中文还是英文？", choices: [{ id: "zh", label: "中文" }, { id: "en", label: "英文" }], allowCustom: true } }) },
  ]);
  const cards = page.getByTestId("approval-card");
  await expect(cards).toHaveCount(2); // T7: control's copy of ar-2 merged, not a third card
  await expect(cards.nth(1)).toContainText("子助手 · main/researcher");
  await expect(cards.nth(0)).not.toContainText("子助手");
  const question = page.getByTestId("question-card");
  await expect(question).toHaveAttribute("data-state", "open");
  await expect(question).toContainText("子助手 · main/researcher");
  await shot(page, "parallel-asks-and-question");

  await cards.nth(0).getByRole("button", { name: "允许这一次" }).click();
  await expect(cards.nth(0)).toHaveAttribute("data-state", "decided");
  await expect(cards.nth(1)).toHaveAttribute("data-state", "pending");

  await emit(request, { data: activity("ev-q1a", 0, { type: "question.answered", turnId: "tn-1", answer: { questionId: "q1", choiceIds: ["zh"], text: "中文，正式一些" } }) });
  await expect(question).toHaveAttribute("data-state", "answered"); // T8
  await expect(question).toContainText("你的回答：中文，正式一些");
  await metrics({ cards: { approvalCards: await cards.count(), questionState: await question.getAttribute("data-state") } });
  await shot(page, "cards-after-decision");
});
