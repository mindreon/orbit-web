/**
 * Empty, loading and error states (acceptance #4): never a blank area.
 *
 * Ways this can fail (each is asserted below):
 *   E1 while /activity is slow the conversation is blank instead of saying it is loading.
 *   E2 when /activity fails the conversation is blank or claims there are no messages.
 *   E3 after the failure, 重新加载 does not recover the conversation.
 */
import { activity, control, shot, verify } from "./helpers";
import { expect, test } from "./test";

test("loading and error states have copy, and 重新加载 recovers", { tag: ["@acc-4"] }, async ({ page, request }) => {
  await control(request, "/__test/clear");
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "assistant", text: "这是已有的回复", turnId: "tn-0" })],
  });

  await control(request, "/__test/faults", { activityDelayMs: 2500 });
  await page.goto("/task/room-e2e");
  await verify([4], "/activity 延迟 2.5 秒时打开任务", "显示「正在加载对话…」，加载完显示已有回复", async () => {
    await expect(page.getByText("正在加载对话…")).toBeVisible(); // E1
    await shot(page, "loading");
    await expect(page.getByText("这是已有的回复")).toBeVisible({ timeout: 10_000 });
    return "先显示「正在加载对话…」，随后显示「这是已有的回复」";
  });

  await control(request, "/__test/faults", { activityStatus: 500 });
  await page.reload();
  const error = page.getByRole("alert").filter({ hasText: "对话加载失败" });
  await verify([4], "/activity 返回 500 时刷新", "显示出错文案和「重新加载」按钮，不显示「还没有消息」", async () => {
    await expect(error).toBeVisible(); // E2
    await expect(page.getByText("还没有消息")).toHaveCount(0);
    return `出错提示「${(await error.textContent())?.trim()}」；「还没有消息」0 处`;
  });
  await shot(page, "error");

  await control(request, "/__test/faults", {});
  await verify([4], "恢复服务后点「重新加载」", "对话恢复显示", async () => {
    await error.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("这是已有的回复")).toBeVisible(); // E3
    return "「这是已有的回复」重新显示";
  });
});
