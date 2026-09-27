/**
 * Rendered assistant content on the running stack: security and code/table layout.
 *
 * Ways this can fail (each is asserted below):
 *   S1 raw HTML streamed by the model becomes live DOM: <script>, or on* attributes (also inside the Mermaid SVG).
 *   S2 a javascript: URL survives as a link.
 *   S3 a link opens without rel="noopener noreferrer".
 *   S4 a remote image loads before the reader clicks, or with a Referer header.
 *   S5 anything runs (a dialog opens).
 *   Y1 copying a code block gives no toast; Y2 the clipboard gets anything but the raw code.
 *   W1 at 375px the page scrolls horizontally; W2 long code or a wide table widens the page.
 */
import { expect, test } from "../test";
import { assistantItems, metrics, newRoom, openRoom, send, shot, streamPrompt, verify } from "./helpers";

const HOSTILE = [
  "原始 HTML：<script>window.__pwned = 1; alert('script')</script> <img src=x onerror=\"alert('img')\"> <a href=\"javascript:alert('a')\">坏链接</a>\n\n",
  "[Markdown 坏链接](javascript:alert('md'))，[官网](https://example.com/docs)\n\n",
  "![对方 logo](https://tracker.example.com/pixel.png?u=42)\n\n",
  "公式：$\\href{javascript:alert('katex')}{点我}$ 和 $E = mc^2$\n\n",
  "```html\n<script>alert('code')</script>\n```\n\n",
  "```mermaid\nflowchart LR\n  A[\"<img src=x onerror=alert('mmd')>开始\"] --> B[结束]\n```\n\n",
  "【安全检查结束】",
];

test("model output streamed through the stack is rendered inert", { tag: ["@acc-8"] }, async ({ page, request }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const imageRequests: (string | null)[] = [];
  await page.route("https://tracker.example.com/**", (route) => {
    imageRequests.push(route.request().headers()["referer"] ?? null);
    void route.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") });
  });
  const roomId = await newRoom(request, "stack · 安全");
  await openRoom(page, roomId);
  await send(page, streamPrompt(HOSTILE));
  const answer = assistantItems(page).filter({ hasText: "【安全检查结束】" });
  await expect(answer).toHaveCount(1);
  await expect(answer.locator(".md-mermaid svg")).toHaveCount(1);
  await expect(answer.locator(".katex").first()).toBeVisible();

  const audit = await page.getByTestId("chat-scroll").evaluate((root) => {
    const elements = [root, ...root.querySelectorAll("*")];
    return {
      scripts: root.querySelectorAll("script").length,
      handlers: elements.flatMap((el) => [...el.attributes].filter((attr) => attr.name.toLowerCase().startsWith("on")).map((attr) => `${el.tagName}.${attr.name}`)),
      jsLinks: elements
        .flatMap((el) => ["href", "src", "xlink:href"].map((name) => el.getAttribute(name) ?? ""))
        .filter((value) => value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase().startsWith("javascript:")),
      links: [...root.querySelectorAll(".md a[href]")].map((a) => a.getAttribute("rel") ?? ""),
      images: root.querySelectorAll("img").length,
      mermaidSvgHandlers: [...root.querySelectorAll(".md-mermaid svg *")].filter((el) => [...el.attributes].some((attr) => attr.name.startsWith("on"))).length,
    };
  });
  await verify([8], "假模型流式输出含 <script>、onerror、javascript: 链接（HTML/Markdown/KaTeX \\href）、外部图片、带 onerror 的 Mermaid 节点", "渲染结果没有 <script>、没有 on* 属性（Mermaid SVG 里也没有）、没有 javascript: 链接；外链都带 rel=noopener noreferrer；外部图片未加载", async () => {
    expect(audit.scripts).toBe(0); // S1
    expect(audit.handlers).toEqual([]);
    expect(audit.mermaidSvgHandlers).toBe(0);
    expect(audit.jsLinks).toEqual([]); // S2
    expect(audit.links.length).toBeGreaterThan(0);
    for (const rel of audit.links) expect(rel).toMatch(/noopener.*noreferrer|noreferrer.*noopener/); // S3
    expect(audit.images).toBe(0); // S4
    expect(imageRequests).toEqual([]);
    return `<script> ${audit.scripts} 个；on* 属性 ${audit.handlers.length} 个（Mermaid SVG 内 ${audit.mermaidSvgHandlers} 个）；javascript: 链接 ${audit.jsLinks.length} 个；外链 ${audit.links.length} 个，rel = ${JSON.stringify([...new Set(audit.links)])}；<img> ${audit.images} 个，图片请求 ${imageRequests.length} 次`;
  });
  await shot(page, "hostile-content-inert");

  await verify([8], "点外部图片的「加载图片」", "图片这时才加载，带 referrerpolicy=\"no-referrer\"，请求里没有 Referer；整个过程没有弹窗、没有脚本执行", async () => {
    await page.getByTestId("blocked-image").getByRole("button", { name: "加载图片" }).click();
    await expect(answer.locator('img[src^="https://tracker.example.com/"]')).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect.poll(() => imageRequests.length).toBe(1);
    expect(imageRequests[0]).toBeNull();
    expect(dialogs).toEqual([]); // S5
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    return `图片请求 ${imageRequests.length} 次，referrerpolicy="${await answer.locator('img[src^="https://tracker.example.com/"]').getAttribute("referrerpolicy")}"，Referer 头 ${imageRequests[0] === null ? "无" : "有"}；弹窗 ${dialogs.length} 个；window.__pwned 未定义`;
  });
  await metrics({ security: { ...audit, linkCount: audit.links.length, imageRequestsAfterClick: imageRequests.length, dialogs: dialogs.length } });
  await shot(page, "image-loaded-on-click");
});

const RAW_CODE = 'const html = "<div class=\\"x\\">a & b</div>"; // a deliberately long line that must scroll inside the code block on a phone';
const WIDE_TABLE =
  "| Clause | Original text | Risk | Proposed change | Basis | Owner | Due | Status |\n|---|---|---|---|---|---|---|---|\n| 7 | Party A pays the full price within thirty days after acceptance | high | Pay in instalments and keep a 10% retention | Civil Code art. 585 | Legal | 2026-10-01 | open |\n";

test("code copies raw with a toast; code and tables scroll inside their blocks down to 375px", { tag: ["@acc-15"] }, async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const roomId = await newRoom(request, "stack · 代码与表格");
  await openRoom(page, roomId);
  await send(page, streamPrompt([`代码：\n\n\`\`\`typescript\n${RAW_CODE}\n\`\`\`\n\n`, `表格：\n\n${WIDE_TABLE}\n`, "【布局检查结束】"]));
  const answer = assistantItems(page).filter({ hasText: "【布局检查结束】" });
  await expect(answer).toHaveCount(1);

  await verify([15], "点代码块的「复制代码」", "出现「已复制代码」提示；剪贴板是原始代码（无行号、无 HTML）", async () => {
    await answer.locator(".md-code").getByRole("button", { name: "复制代码" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已复制代码" })).toBeVisible(); // Y1
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(RAW_CODE); // Y2
    return `提示「已复制代码」可见；剪贴板与原始代码逐字相同（${copied.length} 字符）`;
  });
  await shot(page, "copy-toast");

  const results: Record<string, unknown> = {};
  for (const width of [375, 1440]) {
    await verify([15], `视口宽 ${width}px`, "页面和对话区没有横向滚动；长代码在代码块内横向滚动" + (width === 375 ? "；宽表格在表格块内横向滚动" : ""), async () => {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await page.waitForTimeout(300);
      const closeRail = page.getByRole("button", { name: "关闭", exact: true });
      if (width === 375 && (await closeRail.isVisible())) await closeRail.click();
      const overflow = await page.evaluate(() => {
        const pre = document.querySelector(".md-code pre")!;
        const table = document.querySelector(".md-table-wrap")!;
        const chat = document.querySelector('[data-testid="chat-scroll"]')!;
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          chat: chat.scrollWidth - chat.clientWidth,
          pre: pre.scrollWidth - pre.clientWidth,
          table: table.scrollWidth - table.clientWidth,
        };
      });
      results[`${width}px`] = overflow;
      expect(overflow.page).toBeLessThanOrEqual(0); // W1
      expect(overflow.chat).toBeLessThanOrEqual(0);
      expect(overflow.pre).toBeGreaterThan(0); // W2
      if (width === 375) expect(overflow.table).toBeGreaterThan(0);
      return `页面横向溢出 ${overflow.page} px，对话区 ${overflow.chat} px；代码块内可横向滚动：${overflow.pre > 0}；表格块内可横向滚动：${overflow.table > 0}`;
    });
    await shot(page, `layout-${width}px`);
  }
  await metrics({ overflow: results });
});
