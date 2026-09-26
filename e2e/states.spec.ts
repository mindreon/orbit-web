/**
 * Empty, loading and error states (acceptance #4): never a blank area.
 *
 * Ways this can fail (each is asserted below):
 *   E1 while /activity is slow the conversation is blank instead of saying it is loading.
 *   E2 when /activity fails the conversation is blank or claims there are no messages.
 *   E3 after the failure, 重新加载 does not recover the conversation.
 */
import { expect, test } from "@playwright/test";
import { activity, control, metrics, shot } from "./helpers";

test("loading and error states have copy, and 重新加载 recovers", { tag: ["@acc-4"] }, async ({ page, request }) => {
  await control(request, "/__test/clear");
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "assistant", text: "这是已有的回复", turnId: "tn-0" })],
  });

  await control(request, "/__test/faults", { activityDelayMs: 2500 });
  await page.goto("/task/room-e2e");
  await expect(page.getByText("正在加载对话…")).toBeVisible(); // E1
  await shot(page, "loading");
  await expect(page.getByText("这是已有的回复")).toBeVisible({ timeout: 10_000 });

  await control(request, "/__test/faults", { activityStatus: 500 });
  await page.reload();
  const error = page.getByRole("alert").filter({ hasText: "对话加载失败" });
  await expect(error).toBeVisible(); // E2
  await expect(page.getByText("还没有消息")).toHaveCount(0);
  await shot(page, "error");
  const errorCopy = (await error.textContent())?.trim() ?? "";

  await control(request, "/__test/faults", {});
  await error.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByText("这是已有的回复")).toBeVisible(); // E3
  await metrics({ states: { loading: "正在加载对话…", error: errorCopy, recoveredBy: "重新加载" } });
});
