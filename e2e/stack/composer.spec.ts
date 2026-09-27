/**
 * Composer keys against the running stack (Chromium and WebKit).
 *
 * Ways this can fail (each is asserted below):
 *   K1 Enter does not send, or the reply never arrives.
 *   K2 Shift+Enter sends instead of breaking the line.
 *   K3 Enter while composing (isComposing, keyCode 229, or Safari's compositionend-first order) sends.
 *   K4 blank or whitespace-only input sends.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../test";
import { assistantItems, newRoom, openRoom, shot, userItems, verify } from "./helpers";

async function imeKeydown(page: Page, init: { isComposing: boolean; keyCode: number; compositionEndFirst?: boolean }) {
  await page.getByLabel("输入消息").evaluate((area, options) => {
    if (options.compositionEndFirst) {
      area.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      area.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "合同" }));
    }
    const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, isComposing: options.isComposing });
    Object.defineProperty(event, "keyCode", { get: () => options.keyCode });
    Object.defineProperty(event, "which", { get: () => options.keyCode });
    area.dispatchEvent(event);
  }, init);
}

test("Enter sends to the stack, Shift+Enter breaks the line, IME Enter and blank input never send", { tag: ["@acc-14"] }, async ({ page, request, browserName }) => {
  const roomId = await newRoom(request, "stack · 输入框");
  await openRoom(page, roomId);
  const box = page.getByLabel("输入消息");

  await verify([14], `[${browserName}] 输入框只有空格和换行时按 Enter`, "发送按钮禁用，不发送", async () => {
    await box.click();
    await box.fill("   \n  ");
    await expect(page.getByTestId("send-message")).toBeDisabled();
    await box.press("Enter"); // K4
    await page.waitForTimeout(500);
    await expect(userItems(page)).toHaveCount(0);
    return `发送按钮禁用；用户消息 ${await userItems(page).count()} 条`;
  });

  await verify([14], `[${browserName}] 输入「第一行」，按 Shift+Enter，再输入「第二行」`, "换行而不发送", async () => {
    await box.fill("第一行");
    await box.press("Shift+Enter"); // K2
    await box.pressSequentially("第二行");
    await expect(box).toHaveValue("第一行\n第二行");
    await expect(userItems(page)).toHaveCount(0);
    return `输入框内容 ${JSON.stringify(await box.inputValue())}；用户消息 ${await userItems(page).count()} 条`;
  });

  await verify([14], `[${browserName}] 选字期间按 Enter：isComposing=true；keyCode=229；Safari 顺序（compositionend 先于 keydown）`, "三种情况都不发送，输入框内容保留", async () => {
    await imeKeydown(page, { isComposing: true, keyCode: 229 }); // K3
    await imeKeydown(page, { isComposing: false, keyCode: 229 });
    await imeKeydown(page, { isComposing: false, keyCode: 13, compositionEndFirst: true });
    await page.waitForTimeout(1500);
    await expect(userItems(page)).toHaveCount(0);
    await expect(box).toHaveValue("第一行\n第二行");
    return `用户消息 ${await userItems(page).count()} 条；输入框内容 ${JSON.stringify(await box.inputValue())}`;
  });

  await verify([14], `[${browserName}] 按 Enter`, "发送一条两行的消息，收到假模型回复，输入框清空", async () => {
    await box.press("Enter"); // K1
    await expect(userItems(page)).toHaveCount(1);
    await expect(userItems(page).first()).toContainText("第一行\n第二行");
    await expect(assistantItems(page).filter({ hasText: /^助手hello/ })).toHaveCount(1);
    await expect(box).toHaveValue("");
    return `用户消息 ${await userItems(page).count()} 条（内容「第一行\\n第二行」）；助手回复 ${await assistantItems(page).count()} 条；输入框 ${JSON.stringify(await box.inputValue())}`;
  });
  await shot(page, "composer-sent");
});
