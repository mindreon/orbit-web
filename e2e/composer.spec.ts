/**
 * Composer keys (acceptance #14). Runs on Chromium and WebKit (Safari's engine).
 *
 * Ways this can fail (each is asserted below):
 *   K1 Enter does not send, or sends untrimmed text, or leaves the text in the box.
 *   K2 Shift+Enter sends instead of inserting a newline.
 *   K3 Enter while an IME candidate is open (isComposing true) sends the half-typed text.
 *   K4 Enter with keyCode 229 (the IME's own key, isComposing false) sends.
 *   K5 Safari order: compositionend fires before the keydown of the Enter that confirmed the candidate, and that
 *      keydown sends.
 *   K6 an empty or whitespace-only box sends on Enter, or the send button is enabled for it.
 */
import { expect, test, type Page } from "@playwright/test";
import { activity, control, log, openRoom, shot } from "./helpers";

async function posts(page: Page) {
  return (await log(page.request)).posts;
}

/** Dispatches a keydown the way an IME delivers it. keyCode is defined on the instance because WebKit ignores it in the init dict. */
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

test.beforeEach(async ({ page }) => {
  await control(page.request, "/__test/clear");
  await control(page.request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "assistant", text: "你好，今天要办什么？", turnId: "tn-0" })],
  });
  await openRoom(page, page.request);
  await expect(page.getByText("你好，今天要办什么？")).toBeVisible();
});

test("Enter sends, Shift+Enter breaks the line, IME Enter and blank input never send", { tag: ["@acc-14"] }, async ({ page }) => {
  const box = page.getByLabel("输入消息");
  const send = page.getByTestId("send-message");

  // K6
  await box.click();
  await expect(send).toBeDisabled();
  await page.keyboard.press("Enter");
  await box.fill("   \n  ");
  await expect(send).toBeDisabled();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  expect(await posts(page)).toEqual([]);

  // K2
  await box.fill("");
  await box.pressSequentially("第一行");
  await page.keyboard.press("Shift+Enter");
  await box.pressSequentially("第二行");
  await expect(box).toHaveValue("第一行\n第二行");
  expect(await posts(page)).toEqual([]);

  // K3, K4, K5
  await imeKeydown(page, { isComposing: true, keyCode: 229 });
  await imeKeydown(page, { isComposing: false, keyCode: 229 });
  await imeKeydown(page, { isComposing: false, keyCode: 13, compositionEndFirst: true });
  await page.waitForTimeout(200);
  expect(await posts(page)).toEqual([]);
  await expect(box).toHaveValue("第一行\n第二行");

  // K1
  await box.press("End");
  await box.pressSequentially("  ");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await posts(page)).length).toBe(1);
  const [sent] = await posts(page);
  expect(sent.message).toBe("第一行\n第二行");
  expect(sent.turnId).toMatch(/^tn_web_/);
  await expect(box).toHaveValue("");
  await shot(page, "composer-after-enter");
});
