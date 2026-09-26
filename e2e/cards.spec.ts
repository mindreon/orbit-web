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
import { activity, control, emit, log, metrics, openRoom, shot, toolRows, verify } from "./helpers";
import { expect, test } from "./test";

/**
 * A credential-shaped string inside a turn.failed message. The UI must never show it, and the secret scan
 * (e2e/report/scan.mjs) fails if it reaches the acceptance report.
 */
const PLANTED_KEY = "sk-e2eplantedfakekey0000000000000000000000";

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
  await verify([2], "推送 3 个连续的读文件调用（都成功）", "归成一组「读取 3 个文件」，默认折叠，展开后 3 行", async () => {
    await expect(group).toHaveCount(1); // T1
    await expect(group.getByTestId("tool-row")).toHaveCount(0);
    await group.locator("button").first().click();
    await expect(group.getByTestId("tool-row")).toHaveCount(3);
    return `分组 ${await group.count()} 个（「读取 3 个文件」），展开后 ${await group.getByTestId("tool-row").count()} 行`;
  });

  let states: (string | null)[] = [];
  await verify([2], "再推送一个失败的命令、一个被拒绝的写文件、一个还在运行的读文件（tool.call/tool.result 按 callId 配对）", "四种状态都能区分：成功 / 失败 / 已拒绝 / 运行中", async () => {
    states = await toolRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute("data-state")));
    expect(new Set(states)).toEqual(new Set(["success", "failed", "rejected", "running"])); // T2
    const shown: string[] = [];
    for (const [state, label] of [["success", "成功"], ["failed", "失败"], ["rejected", "已拒绝"], ["running", "运行中"]]) {
      await expect(page.locator(`[data-testid="tool-row"][data-state="${state}"]`).first()).toContainText(label);
      shown.push(`${state}→${label}`);
    }
    return `各行状态 ${JSON.stringify(states)}；文案 ${shown.join("，")}`;
  });

  await verify([12], "看运行中的那行和整个对话区的可见文字", "运行中写成「正在读取 附件.xlsx」；原始函数名和 JSON 参数不出现", async () => {
    const running = page.locator('[data-testid="tool-row"][data-state="running"]');
    await expect(running).toContainText(/正在读取\s*附件\.xlsx/); // T3
    const visible = await page.getByTestId("chat-scroll").innerText();
    expect(visible).not.toMatch(/view_text_file|execute_shell_command|write_text_file|\{"/);
    return "运行中那行含「正在读取 附件.xlsx」；可见文字里没有 view_text_file / execute_shell_command / write_text_file / JSON";
  });
  await shot(page, "tool-states-and-group");

  // T4 + T5: a retryable failure, then a non-retryable one.
  await emit(request, [
    { data: activity("ev-f1", 0, { type: "turn.failed", turnId: "tn-1", failure: { turnId: "tn-1", agentId: "main", errorCode: "rate_limited", retryable: true, message: "provider said 429 at 10.0.0.3" } }) },
    { data: activity("ev-u2", 0, { type: "assistant.message", role: "user", text: "换个模型再试", turnId: "tn-2" }) },
    { data: activity("ev-f2", 0, { type: "turn.failed", turnId: "tn-2", failure: { turnId: "tn-2", agentId: "main", errorCode: "auth", retryable: true, message: `invalid key ${PLANTED_KEY}` } }) },
  ]);
  const cards = page.getByTestId("failure-card");
  await verify([2], "推送两个 turn.failed：rate_limited（retryable）和 auth（retryable 也为 true，message 里带内网地址和一串密钥）", "按 errorCode 显示固定文案，不显示事件自带的 message；只有 rate_limited 有「重试」，auth 没有；任何地方都没有「重新批准」", async () => {
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("模型服务现在太忙，这一轮被限流了。");
    await expect(cards.nth(1)).toContainText("模型服务的凭据无效或已过期");
    await expect(page.getByTestId("chat-scroll")).not.toContainText("provider said 429"); // T4
    await expect(page.getByTestId("chat-scroll")).not.toContainText(PLANTED_KEY);
    await expect(cards.nth(0).getByRole("button", { name: "重试" })).toBeVisible();
    await expect(cards.nth(1).getByRole("button", { name: "重试" })).toHaveCount(0); // T5
    await expect(page.getByText("重新批准")).toHaveCount(0); // T6
    return `失败卡 ${await cards.count()} 张：rate_limited 显示固定文案并有「重试」，auth 显示固定文案、「重试」0 个；事件 message 未显示；「重新批准」0 处`;
  });

  await verify([2], "点 rate_limited 卡上的「重试」", "重发原来的用户消息，用新的 turnId", async () => {
    await cards.nth(0).getByRole("button", { name: "重试" }).click();
    await expect.poll(async () => (await log(request)).posts.length).toBe(1);
    const [retry] = (await log(request)).posts;
    expect(retry.message).toBe("把三份材料读一下再处理");
    expect(retry.turnId).toMatch(/^tn_web_/);
    expect(retry.turnId).not.toBe("tn-1");
    return `发出 1 条，内容「${retry.message}」，turnId 以 tn_web_ 开头（不是失败的 tn-1）`;
  });
  await metrics({ toolStates: states });
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
  const question = page.getByTestId("question-card");
  await verify([3], "推送两个并行的 approval.asked（第二个来自子助手 main/researcher，control 又发了一份同一请求的副本）和一个子助手的 question.asked", "每个调用一张卡，共 2 张（副本合并）；子助手的卡片和追问卡标明「子助手 · main/researcher」，主助手的卡不标", async () => {
    await expect(cards).toHaveCount(2); // T7: control's copy of ar-2 merged, not a third card
    await expect(cards.nth(1)).toContainText("子助手 · main/researcher");
    await expect(cards.nth(0)).not.toContainText("子助手");
    await expect(question).toHaveAttribute("data-state", "open");
    await expect(question).toContainText("子助手 · main/researcher");
    return `审批卡 ${await cards.count()} 张：第 1 张无子助手标签，第 2 张「子助手 · main/researcher」；追问卡状态 ${await question.getAttribute("data-state")}，标「子助手 · main/researcher」`;
  });
  await shot(page, "parallel-asks-and-question");

  await verify([3], "对第 1 张卡点「允许这一次」，再推送 question.answered", "第 1 张变只读，第 2 张仍待审批；追问卡原地变为已回答并显示回答", async () => {
    await cards.nth(0).getByRole("button", { name: "允许这一次" }).click();
    await expect(cards.nth(0)).toHaveAttribute("data-state", "decided");
    await expect(cards.nth(1)).toHaveAttribute("data-state", "pending");
    await emit(request, { data: activity("ev-q1a", 0, { type: "question.answered", turnId: "tn-1", answer: { questionId: "q1", choiceIds: ["zh"], text: "中文，正式一些" } }) });
    await expect(question).toHaveAttribute("data-state", "answered"); // T8
    await expect(question).toContainText("你的回答：中文，正式一些");
    return `第 1 张 ${await cards.nth(0).getAttribute("data-state")}，第 2 张 ${await cards.nth(1).getAttribute("data-state")}；追问卡 ${await question.getAttribute("data-state")}，显示「你的回答：中文，正式一些」`;
  });
  await shot(page, "cards-after-decision");
});
