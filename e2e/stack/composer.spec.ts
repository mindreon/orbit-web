/**
 * Composer keys against the running stack (Chromium and WebKit).
 *
 * Ways this can fail (each is asserted below):
 *   K1 Enter does not send, or the reply never arrives.
 *   K2 Shift+Enter sends instead of breaking the line.
 *   K3 Enter while composing (isComposing, keyCode 229, or Safari's compositionend-first order) sends.
 *   K4 blank or whitespace-only input sends.
 */
import { expect, test, type Page } from "@playwright/test";
import { assistantItems, newRoom, openRoom, shot, userItems } from "./helpers";

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

test("Enter sends to the stack, Shift+Enter breaks the line, IME Enter and blank input never send", { tag: ["@acc-14"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 输入框");
  await openRoom(page, roomId);
  const box = page.getByLabel("输入消息");

  await box.click();
  await box.fill("   \n  ");
  await expect(page.getByTestId("send-message")).toBeDisabled();
  await box.press("Enter"); // K4
  await box.fill("第一行");
  await box.press("Shift+Enter"); // K2
  await box.pressSequentially("第二行");
  await expect(box).toHaveValue("第一行\n第二行");
  await imeKeydown(page, { isComposing: true, keyCode: 229 }); // K3
  await imeKeydown(page, { isComposing: false, keyCode: 229 });
  await imeKeydown(page, { isComposing: false, keyCode: 13, compositionEndFirst: true });
  await page.waitForTimeout(1500);
  await expect(userItems(page)).toHaveCount(0);
  await expect(box).toHaveValue("第一行\n第二行");

  await box.press("Enter"); // K1
  await expect(userItems(page)).toHaveCount(1);
  await expect(userItems(page).first()).toContainText("第一行\n第二行");
  await expect(assistantItems(page).filter({ hasText: /^助手hello/ })).toHaveCount(1);
  await expect(box).toHaveValue("");
  await shot(page, "composer-sent");
});
