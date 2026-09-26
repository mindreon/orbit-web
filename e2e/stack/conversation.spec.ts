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
import { expect, test } from "@playwright/test";
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
  await expect(page.getByText("还没有消息。发送后，这里显示这件云端任务的真实回复。")).toBeVisible(); // C2
  // Opening the session already emits worker events, which carry modelMode.
  await expect(page.getByTestId("model-mode")).toHaveText("假模型");

  const parts = ["## 合同审阅（流式）\n\n"];
  for (let index = 1; index <= 60; index += 1) parts.push(`第 ${index} 段：The penalty clause should be capped at twenty percent of the contract amount.\n\n`);
  parts.push("```python\ndef penalty(amount, days):\n    return min(0.2 * amount, 0.0005 * amount * days)\n```\n\n", "【流式结束】");
  await send(page, streamPrompt(parts));

  const final = assistantItems(page).filter({ hasText: "【流式结束】" });
  await expect(final).toHaveCount(1); // C1
  await expect(page.getByTestId("assistant-draft")).toHaveCount(0);
  await expect(userItems(page)).toHaveCount(1);
  const draftMax = await page.evaluate(() => (window as unknown as { __draftMax: number }).__draftMax);
  expect(draftMax).toBeGreaterThan(0); // C1: deltas were on screen before the final message
  await expect(page.getByTestId("model-mode")).toHaveText("假模型"); // C2

  const events = await activity(request, roomId);
  await metrics({
    streamedReply: {
      parts: parts.length,
      finalChars: parts.join("").length,
      liveDraftCharsSeen: draftMax,
      modelModeOnEvents: [...new Set(events.map((event) => event.payload.modelMode).filter(Boolean))],
    },
  });
  await shot(page, "streamed-reply-final");
});

test("tool call appears within 2 s, one approval card per call, read-only after allowing", { tag: ["@acc-1", "@acc-2", "@acc-3", "@acc-4", "@acc-12"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 审批允许");
  await openRoom(page, roomId);
  const started = Date.now();
  await send(page, echoPrompt("合同.docx 的第七条"));
  await expect(toolRows(page)).toHaveCount(1);
  const toolVisibleMs = Date.now() - started;
  expect(toolVisibleMs).toBeLessThanOrEqual(2000); // C3

  const card = approvalCards(page);
  await expect(card).toHaveCount(1);
  await page.waitForTimeout(800);
  await expect(card).toHaveCount(1); // C4: control's approval.asked merged into the worker's card
  await expect(card).toHaveAttribute("data-state", "pending");
  await expect(page.getByTestId("stop-turn")).toBeVisible(); // running while the call waits
  for (const text of [await toolRows(page).first().textContent(), await card.textContent()]) expect(text).not.toContain("gated_echo"); // C8
  await shot(page, "approval-pending");

  await card.getByRole("button", { name: "允许这一次" }).click();
  await expect(card).toHaveAttribute("data-state", "decided"); // C5
  await expect(card.getByTestId("approval-decision")).toContainText("已允许这一次");
  await expect(card.getByRole("button", { name: "允许这一次" })).toHaveCount(0);
  await expect(toolRows(page).first()).toHaveAttribute("data-state", "success"); // C3: paired by callId
  await expect(assistantItems(page).filter({ hasText: /^助手done/ })).toHaveCount(1);
  await expect(page.getByTestId("stop-turn")).toHaveCount(0);

  await toolRows(page).first().getByRole("button").first().click();
  await expect(toolRows(page).first()).toContainText("技术详情");
  await expect(toolRows(page).first()).toContainText("gated_echo"); // C8: only inside the expanded detail

  const events = await activity(request, roomId);
  await metrics({
    approvalAllow: {
      toolVisibleMs,
      approvalAskedEvents: events.filter((event) => event.type === "approval.asked").map((event) => event.source),
      cardsRendered: 1,
    },
  });
  await shot(page, "approval-allowed");
});

test("rejecting the approval shows the call as 已拒绝 and the card read-only", { tag: ["@acc-2", "@acc-3"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 审批拒绝");
  await openRoom(page, roomId);
  await send(page, echoPrompt("删除临时文件"));
  const card = approvalCards(page);
  await expect(card).toHaveAttribute("data-state", "pending");
  await card.getByRole("button", { name: "拒绝" }).click();
  await expect(card).toHaveAttribute("data-state", "decided"); // C5
  await expect(card.getByTestId("approval-decision")).toContainText("已拒绝");
  await expect(toolRows(page).first()).toHaveAttribute("data-state", "rejected"); // C6
  await expect(toolRows(page).first()).toContainText("已拒绝");
  await shot(page, "approval-rejected");
});

test("停止 while a call waits for approval leaves every control consistent", { tag: ["@acc-4"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 停止");
  await openRoom(page, roomId);
  await send(page, echoPrompt("跑一下全量测试"));
  await expect(approvalCards(page)).toHaveAttribute("data-state", "pending");
  await expect(toolRows(page).first()).toHaveAttribute("data-state", "running");
  await page.getByTestId("stop-turn").click();

  await expect(page.getByTestId("stop-turn")).toHaveCount(0); // C7
  await expect(toolRows(page).first()).toHaveAttribute("data-state", "failed");
  await expect(toolRows(page).first()).toContainText("任务已停止");
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await expect(approvalCards(page).getByRole("button", { name: "允许这一次" })).toHaveCount(0);
  await expect(approvalCards(page)).toContainText("任务已停止");
  await expect(page.getByTestId("send-message")).toHaveText("接着说");
  await shot(page, "after-stop");
});

test("sub-agent tools read as business steps and pair with their results", { tag: ["@acc-2", "@acc-3", "@acc-12"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 子助手");
  await openRoom(page, roomId);
  await send(page, "spawn two");
  await expect(assistantItems(page).filter({ hasText: /^助手team-done/ })).toHaveCount(1);
  const rows = toolRows(page);
  const groups = page.getByTestId("tool-group");
  for (let index = 0; index < (await groups.count()); index += 1) await groups.nth(index).locator("button").first().click();
  const labels = await rows.allTextContents();
  expect(labels.filter((label) => label.includes("委派子助手")).length).toBe(2);
  expect(labels.some((label) => label.includes("等待子助手完成"))).toBe(true);
  expect(labels.some((label) => label.includes("结束子助手协作"))).toBe(true);
  for (const state of await rows.evaluateAll((els) => els.map((el) => el.getAttribute("data-state")))) expect(state).toBe("success");
  for (const label of labels) expect(label).not.toMatch(/agent_spawn|agent_wait|team_dissolve|\{"/); // C8

  const events = await activity(request, roomId);
  const agentPaths = [...new Set(events.map((event) => event.payload.agentPath).filter(Boolean))] as string[];
  // At the pinned runtime every spawned agent still reports agentPath "main"; when paths appear, the label must show.
  if (agentPaths.some((path) => path !== "main")) await expect(page.getByText(/子助手 · /).first()).toBeVisible();
  await metrics({ subAgents: { toolRows: labels.length, agentPathsReported: agentPaths } });
  await shot(page, "sub-agent-tools");
});
