/**
 * Code copy and horizontal overflow (acceptance #15).
 *
 * Ways this can fail (each is asserted below):
 *   Y1 copying a code block gives no visible confirmation (toast).
 *   Y2 the clipboard gets rendered HTML, escaped entities or highlight markup instead of the raw code.
 *   Y3 the clipboard gets line numbers.
 *   W1 at 375px the page itself scrolls horizontally (sidebar, rail, header or composer too wide).
 *   W2 a long code line widens the page instead of scrolling inside the code block.
 *   W3 a wide table widens the page instead of scrolling inside its wrapper.
 *   W4 the conversation column itself scrolls horizontally.
 */
import { expect, test, type Page } from "@playwright/test";
import { activity, control, metrics, openRoom, shot } from "./helpers";

const RAW_CODE = [
  'const html = "<div class=\\"x\\">a & b</div>"; // raw markup and entities must survive copying untouched',
  "for (let i = 0; i < 3; i += 1) {",
  "  console.log(`line ${i}: ${\"一段很长很长的中文注释\".repeat(6)}`);",
  "}",
].join("\n");

const WIDE_TABLE = [
  "| 条款 | 原文摘要 | 风险 | 建议修改 | 依据 | 负责人 | 截止日期 | 状态 |",
  "|---|---|---|---|---|---|---|---|",
  "| 第 7 条 | 甲方应在验收合格后三十日内一次性支付全部合同价款 | 高 | 改为分期付款并保留百分之十质保金 | 民法典第五百八十五条 | 法务部 | 2026-10-01 | 待确认 |",
].join("\n");

const ANSWER = `代码如下：\n\n\`\`\`typescript\n${RAW_CODE}\n\`\`\`\n\n表格如下：\n\n${WIDE_TABLE}\n\n一个很长的链接 https://example.com/${"very-long-path-segment-".repeat(12)} 也不能撑宽页面。`;

async function seed(page: Page) {
  await control(page.request, "/__test/clear");
  await control(page.request, "/__test/activity", {
    items: [
      activity("ev-1", 1, { type: "assistant.message", role: "user", text: "给我一段代码和一张宽表", turnId: "tn-1" }),
      activity("ev-2", 2, { type: "assistant.message", role: "assistant", text: ANSWER, turnId: "tn-1" }),
    ],
  });
  await openRoom(page, page.request);
  await expect(page.locator(".md-code")).toBeVisible();
}

function overflow(page: Page) {
  return page.evaluate(() => {
    const pre = document.querySelector(".md-code pre")!;
    const table = document.querySelector(".md-table-wrap")!;
    const chat = document.querySelector('[data-testid="chat-scroll"]')!;
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      body: document.body.scrollWidth - window.innerWidth,
      chat: chat.scrollWidth - chat.clientWidth,
      pre: pre.scrollWidth - pre.clientWidth,
      preOverflow: getComputedStyle(pre).overflowX,
      table: table.scrollWidth - table.clientWidth,
      tableOverflow: getComputedStyle(table).overflowX,
    };
  });
}

test("copy button copies the raw code and shows a toast", { tag: ["@acc-15"] }, async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seed(page);
  await page.locator(".md-code").getByRole("button", { name: "复制代码" }).click();
  await expect(page.getByRole("status").filter({ hasText: "已复制" })).toBeVisible(); // Y1
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(RAW_CODE); // Y2 + Y3
  await shot(page, "copy-toast");
});

for (const width of [375, 1440]) {
  test(`no page-level horizontal scroll at ${width}px; code and tables scroll inside their blocks`, { tag: ["@acc-15"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await seed(page);
    await expect(page.getByText("表格如下")).toBeVisible();
    const result = await overflow(page);
    await metrics({ [`overflowAt${width}px`]: result });
    expect(result.page).toBeLessThanOrEqual(0); // W1
    expect(result.body).toBeLessThanOrEqual(0);
    expect(result.chat).toBeLessThanOrEqual(0); // W4
    expect(result.pre).toBeGreaterThan(0); // W2: the long line scrolls inside the block
    expect(result.preOverflow).toBe("auto");
    if (width === 375) expect(result.table).toBeGreaterThan(0); // W3
    expect(result.tableOverflow).toBe("auto");
    await expect(page.getByLabel("输入消息")).toBeInViewport();
    await shot(page, `layout-${width}`);
  });
}
