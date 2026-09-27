/**
 * Conversation flow on the running stack (mock model mode).
 *
 * Ways this can fail (each is asserted below):
 *   C1 a streamed reply never renders live (deltas ignored) or shows twice once the final message arrives.
 *   C2 the mock model mode is not visible, or a fresh task shows a blank area instead of the empty-state copy.
 *   C3 a tool call takes longer than 2 s to appear, or tool.call/tool.result are not paired into one row.
 *   C4 the worker's approval.asked and control's approval.asked for the same call render two cards.
 *   C5 an approval card keeps its buttons after the decision, or the decision is not shown.
 *   C6 a rejected call is not shown as 已拒绝.
 *   C7 after 停止, the stop button stays, the running row keeps spinning, or the card still offers a decision.
 *   C8 raw tool names (gated_echo, agent_spawn) or JSON arguments show outside the collapsed technical details.
 */
import { expect, test } from "../test";
import {
  activity,
  approvalCards,
  assistantItems,
  echoPrompt,
  metrics,
  newRoom,
  openRoom,
  send,
  shot,
  streamPrompt,
  toolRows,
  userItems,
  verify,
} from "./helpers";

test("a streamed reply renders live, the final message replaces it once, and mock mode is visible", { tag: ["@acc-1", "@acc-4"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 流式回复");
  await page.addInitScript(() => {
    const w = window as unknown as { __draftMax: number };
    w.__draftMax = 0;
    new MutationObserver(() => {
      const draft = document.querySelector('[data-testid="assistant-draft"]');
      if (draft) w.__draftMax = Math.max(w.__draftMax, draft.textContent?.length ?? 0);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await openRoom(page, roomId);
  await verify([4], "打开一件新任务（还没有消息）", "显示空状态文案，模型标记为「假模型」", async () => {
    const empty = page.getByText("还没有消息。发送后，这里显示这件云端任务的真实回复。");
    await expect(empty).toBeVisible(); // C2
    // Opening the session already emits worker events, which carry modelMode.
    await expect(page.getByTestId("model-mode")).toHaveText("假模型");
    return `空状态「${await empty.textContent()}」；模型标记「${await page.getByTestId("model-mode").textContent()}」`;
  });
  await shot(page, "empty-task-mock-mode");

  const parts = ["## 合同审阅（流式）\n\n"];
  for (let index = 1; index <= 60; index += 1) parts.push(`第 ${index} 段：The penalty clause should be capped at twenty percent of the contract amount.\n\n`);
  parts.push("```python\ndef penalty(amount, days):\n    return min(0.2 * amount, 0.0005 * amount * days)\n```\n\n", "【流式结束】");
  await send(page, streamPrompt(parts));

  let draftMax = 0;
  await verify([1], `发送 stream: 提示，假模型把回复拆成 ${parts.length} 个 assistant.delta 推送`, "草稿在最终消息前就逐段出现；最终消息到达后草稿消失，回复只显示一次", async () => {
    const final = assistantItems(page).filter({ hasText: "【流式结束】" });
    await expect(final).toHaveCount(1); // C1
    await expect(page.getByTestId("assistant-draft")).toHaveCount(0);
    await expect(userItems(page)).toHaveCount(1);
    draftMax = await page.evaluate(() => (window as unknown as { __draftMax: number }).__draftMax);
    expect(draftMax).toBeGreaterThan(0); // C1: deltas were on screen before the final message
    return `流式期间看到草稿（有字）；结束后草稿 ${await page.getByTestId("assistant-draft").count()} 个，含「【流式结束】」的回复 ${await final.count()} 条，用户消息 ${await userItems(page).count()} 条`;
  });
  await verify([4], "回复结束后看模型标记", "仍是「假模型」，事件上的 modelMode 为 mock", async () => {
    await expect(page.getByTestId("model-mode")).toHaveText("假模型"); // C2
    const modes = [...new Set((await activity(request, roomId)).map((event) => event.payload.modelMode).filter(Boolean))];
    expect(modes).toEqual(["mock"]);
    return `模型标记「${await page.getByTestId("model-mode").textContent()}」；事件 modelMode = ${JSON.stringify(modes)}`;
  });

  await metrics({ streamedReply: { parts: parts.length, finalChars: parts.join("").length, liveDraftCharsSeen: draftMax } });
  await shot(page, "streamed-reply-final");
});

test("tool call appears within 2 s, one approval card per call, read-only after allowing", { tag: ["@acc-1", "@acc-2", "@acc-3", "@acc-4", "@acc-12"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 审批允许");
  await openRoom(page, roomId);
  const started = Date.now();
  await send(page, echoPrompt("合同.docx 的第七条"));
  let toolVisibleMs = 0;
  await verify([1], "发送 echo: 提示，假模型调用需要审批的 gated_echo 工具", "工具调用行在 2 秒内出现，不需要刷新", async () => {
    await expect(toolRows(page)).toHaveCount(1);
    toolVisibleMs = Date.now() - started;
    expect(toolVisibleMs).toBeLessThanOrEqual(2000); // C3
    return `工具调用行 ${await toolRows(page).count()} 行，出现时间 ≤ 2000 ms（实测见 measurements）`;
  });

  const card = approvalCards(page);
  await verify([3, 4, 12], "等待审批时看卡片、停止按钮和工具行文案", "只有一张待审批卡（worker 和 control 的 approval.asked 合并）；显示「停止」；工具行和卡片不露原始函数名", async () => {
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(800);
    await expect(card).toHaveCount(1); // C4: control's approval.asked merged into the worker's card
    await expect(card).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("stop-turn")).toBeVisible(); // running while the call waits
    for (const text of [await toolRows(page).first().textContent(), await card.textContent()]) expect(text).not.toContain("gated_echo"); // C8
    const sources = (await activity(request, roomId)).filter((event) => event.type === "approval.asked").map((event) => event.source).sort();
    return `approval.asked 事件来源 ${JSON.stringify(sources)}，卡片 ${await card.count()} 张，状态 ${await card.getAttribute("data-state")}；「停止」可见；工具行与卡片文字里没有 gated_echo`;
  });
  await shot(page, "approval-pending");

  await card.getByRole("button", { name: "允许这一次" }).click();
  await verify([2, 3, 4], "点「允许这一次」", "卡片变只读并显示「已允许这一次」；工具行按调用 id 配对成「成功」；回复结束，「停止」消失", async () => {
    await expect(card).toHaveAttribute("data-state", "decided"); // C5
    await expect(card.getByTestId("approval-decision")).toContainText("已允许这一次");
    await expect(card.getByRole("button", { name: "允许这一次" })).toHaveCount(0);
    await expect(toolRows(page).first()).toHaveAttribute("data-state", "success"); // C3: paired by callId
    await expect(assistantItems(page).filter({ hasText: /^助手done/ })).toHaveCount(1);
    await expect(page.getByTestId("stop-turn")).toHaveCount(0);
    return `卡片状态 ${await card.getAttribute("data-state")}，决定「${(await card.getByTestId("approval-decision").textContent())?.trim()}」，按钮 0 个；工具行 ${await toolRows(page).count()} 行，状态 ${await toolRows(page).first().getAttribute("data-state")}；「停止」0 个`;
  });

  await verify([12], "展开工具行", "原始函数名只出现在折叠的「技术详情」里", async () => {
    await toolRows(page).first().getByRole("button").first().click();
    await expect(toolRows(page).first()).toContainText("技术详情");
    await expect(toolRows(page).first()).toContainText("gated_echo"); // C8: only inside the expanded detail
    return "展开后出现「技术详情」，其中含 gated_echo";
  });

  await metrics({ approvalAllow: { toolVisibleMs } });
  await shot(page, "approval-allowed");
});

test("rejecting the approval shows the call as 已拒绝 and the card read-only", { tag: ["@acc-2", "@acc-3"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 审批拒绝");
  await openRoom(page, roomId);
  await send(page, echoPrompt("删除临时文件"));
  const card = approvalCards(page);
  await expect(card).toHaveAttribute("data-state", "pending");
  await card.getByRole("button", { name: "拒绝" }).click();
  await verify([2, 3], "对 gated_echo 的审批点「拒绝」", "卡片只读并显示「已拒绝」；工具行状态「已拒绝」", async () => {
    await expect(card).toHaveAttribute("data-state", "decided"); // C5
    await expect(card.getByTestId("approval-decision")).toContainText("已拒绝");
    await expect(toolRows(page).first()).toHaveAttribute("data-state", "rejected"); // C6
    await expect(toolRows(page).first()).toContainText("已拒绝");
    return `卡片状态 ${await card.getAttribute("data-state")}，决定「${(await card.getByTestId("approval-decision").textContent())?.trim()}」；工具行状态 ${await toolRows(page).first().getAttribute("data-state")}，文案含「已拒绝」`;
  });
  await shot(page, "approval-rejected");
});

test("停止 while a call waits for approval leaves every control consistent", { tag: ["@acc-4"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 停止");
  await openRoom(page, roomId);
  await send(page, echoPrompt("跑一下全量测试"));
  await verify([4], "工具调用等待审批时", "显示「停止」，工具行「运行中」，卡片待审批", async () => {
    await expect(approvalCards(page)).toHaveAttribute("data-state", "pending");
    await expect(toolRows(page).first()).toHaveAttribute("data-state", "running");
    await expect(page.getByTestId("stop-turn")).toBeVisible();
    return `「停止」可见；工具行 ${await toolRows(page).first().getAttribute("data-state")}；卡片 ${await approvalCards(page).getAttribute("data-state")}`;
  });
  await page.getByTestId("stop-turn").click();

  await verify([4], "点「停止」", "「停止」消失，工具行不再转圈、标为「任务已停止」，审批卡不再给按钮，发送按钮变「接着说」", async () => {
    await expect(page.getByTestId("stop-turn")).toHaveCount(0); // C7
    await expect(toolRows(page).first()).toHaveAttribute("data-state", "failed");
    await expect(toolRows(page).first()).toContainText("任务已停止");
    await expect(page.locator(".animate-spin")).toHaveCount(0);
    await expect(approvalCards(page).getByRole("button", { name: "允许这一次" })).toHaveCount(0);
    await expect(approvalCards(page)).toContainText("任务已停止");
    await expect(page.getByTestId("send-message")).toHaveText("接着说");
    return `「停止」0 个；工具行 ${await toolRows(page).first().getAttribute("data-state")}（含「任务已停止」）；转圈 0 个；审批按钮 0 个；发送按钮「${await page.getByTestId("send-message").textContent()}」`;
  });
  await shot(page, "after-stop");
});

test("sub-agent tools read as business steps and pair with their results", { tag: ["@acc-2", "@acc-3", "@acc-12"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 子助手");
  await openRoom(page, roomId);
  await send(page, "spawn two");
  await expect(assistantItems(page).filter({ hasText: /^助手team-done/ })).toHaveCount(1);
  const rows = toolRows(page);
  const groups = page.getByTestId("tool-group");
  let labels: string[] = [];
  await verify([2, 12], "发送 spawn two，假模型派出两个子助手；展开所有分组", "两行「委派子助手」、一行「等待子助手完成」、一行「结束子助手协作」，全部成功；不露 agent_spawn 等函数名和 JSON", async () => {
    for (let index = 0; index < (await groups.count()); index += 1) await groups.nth(index).locator("button").first().click();
    labels = await rows.allTextContents();
    expect(labels.filter((label) => label.includes("委派子助手")).length).toBe(2);
    expect(labels.some((label) => label.includes("等待子助手完成"))).toBe(true);
    expect(labels.some((label) => label.includes("结束子助手协作"))).toBe(true);
    const states = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-state")));
    for (const state of states) expect(state).toBe("success");
    for (const label of labels) expect(label).not.toMatch(/agent_spawn|agent_wait|team_dissolve|\{"/); // C8
    return `委派子助手 ${labels.filter((label) => label.includes("委派子助手")).length} 行，等待子助手完成 ${labels.filter((label) => label.includes("等待子助手完成")).length} 行，结束子助手协作 ${labels.filter((label) => label.includes("结束子助手协作")).length} 行；状态 ${JSON.stringify([...new Set(states)])}；无原始函数名`;
  });

  await verify([3], "看事件里的 agentPath", "agentPath 不是 main 时卡片和行上标出子助手；固定版本的运行时全部报 main", async () => {
    const agentPaths = [...new Set((await activity(request, roomId)).map((event) => event.payload.agentPath).filter(Boolean))] as string[];
    // At the pinned runtime every spawned agent still reports agentPath "main"; when paths appear, the label must show.
    if (agentPaths.some((path) => path !== "main")) await expect(page.getByText(/子助手 · /).first()).toBeVisible();
    return `事件 agentPath = ${JSON.stringify(agentPaths.sort())}；子助手标签在脚本化用例里另行验证`;
  });
  await metrics({ subAgents: { toolRows: labels.length } });
  await shot(page, "sub-agent-tools");
});
