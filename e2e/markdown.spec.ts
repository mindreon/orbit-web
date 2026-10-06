/**
 * Markdown rendering of an agent's final answer, through a real task page with a route-mocked API.
 * Screenshots go to e2e-artifacts/markdown/<theme>-<width>x<height>.png (git-ignored).
 *
 * Ways this can fail (each is asserted below):
 *   M1 a code block has no header, no language label, no wrap toggle, or the copy button does not put the raw source on the clipboard
 *   M2 the wrap toggle does not flip white-space between pre and pre-wrap, or is not an aria-pressed button
 *   M3 a wide table widens the page (documentElement.scrollWidth > innerWidth) instead of scrolling inside its wrapper
 *   M4 a Mermaid fence is not drawn as an SVG, or the diagram is drawn from a half-written fence
 *   M5 display math written as `$$..$$` (multiline) or `\[..\]`, or inline `\(..\)` / `$..$`, is not rendered by KaTeX
 *   M6 a `$` inside a fenced shell command is read as math
 *   M7 clicking a loaded markdown image does not open the lightbox, or Esc does not close it
 *   M8 a block that is still streaming re-highlights on every delta, remounts finished blocks, or loses its text
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const OUT = "e2e-artifacts/markdown";
const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const NOW = "2026-10-05T08:00:00Z";
const IMAGE_URL = "https://images.example.test/release-chart.svg";
const CHART = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200" viewBox="0 0 480 200"><rect width="480" height="200" fill="#dbeafe"/><polyline points="20,170 120,120 220,140 320,60 460,30" fill="none" stroke="#2563eb" stroke-width="6"/></svg>';

const CODE = "const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0); // 汇总本次发布涉及的所有订单金额，用于核对发布前后的差异是否在预期范围内";
const ANSWER = [
  "## 发布检查清单",
  "",
  "本次发布共三项风险，**先处理证书**。行内公式 $E = mc^2$，行内代码 `release.sh --dry-run`，[发布手册](https://example.test/runbook)。",
  "",
  "### 代码",
  "",
  "```ts",
  CODE,
  "console.log(`total = ${total}`);",
  "```",
  "",
  "```bash",
  'echo "$HOME is $USER" && printf "%s\\n" "$$"',
  "```",
  "",
  "### 对照表",
  "",
  "| 风险项 | 负责人 | 截止时间 | 影响范围 | 当前状态 | 回滚方案 | 备注 | 金额 |",
  "| --- | :---: | --- | --- | --- | --- | --- | ---: |",
  "| 数据库迁移窗口与大促重叠 | 张三 | 周三 18:00 | 订单、支付、库存三个核心域 | 评估中 | 回滚到上一个快照并暂停写入 | 需要运维配合 | 1,204.50 |",
  "| 支付网关证书到期 | 李四 | 周四 12:00 | 全部支付渠道 | 已排期 | 切换到备用证书 | 已提前续期 | 98.00 |",
  "",
  "### 流程",
  "",
  "```mermaid",
  "graph TD",
  "  A[开始] --> B{检查通过?}",
  "  B -->|是| C[发布]",
  "  B -->|否| D[回滚]",
  "```",
  "",
  "### 公式",
  "",
  "多行的 `$$` 块：",
  "",
  "$$ \\sum_{i=1}^{n} i",
  "= \\frac{n(n+1)}{2} $$",
  "",
  "方括号写法：\\[ a^2 + b^2 = c^2 \\]",
  "",
  "圆括号写法 \\( x_1 + x_2 \\) 也要渲染。",
  "",
  `![发布趋势图](${IMAGE_URL})`,
  "",
  "> 引用：证书续期不要等到最后一天。",
  "",
  "- 第一项",
  "- 第二项",
  "  - 嵌套项",
  "",
  "---",
  "",
  "结束。",
].join("\n");

const task = {
  task_id: TASK_ID,
  tenant_id: "tenant-a",
  workflow_id: "task/tenant-a/demo",
  title: "整理本周发布风险",
  goal: "把本周的发布风险整理成一页摘要。",
  mode: "single",
  status: "COMPLETED",
  profile: "writer@1",
  plan_version: 1,
  created_by: "user-a",
  created_at: NOW,
  updated_at: NOW,
  budgets: {},
  usage: {},
  pending_approvals: [],
};
const plan = {
  plan_version: 1,
  hash: `sha256:${"a".repeat(64)}`,
  nodes: [{ node_id: "n_1", type: "agent_turn", title: "Draft report", status: "COMPLETED", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: true, attempt_count: 1 }],
  edges: [],
};
const event = (seq: number, type: string, payload: Record<string, unknown>) => ({ seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: NOW });
const events = [
  event(1, "task.created", { goal: task.goal, title: task.title }),
  event(2, "attempt.started", { attempt_id: "att_1", node_id: "n_1", attempt_no: 1, profile: "writer@1" }),
  event(3, "message.agent_final", { attempt_id: "att_1", text: ANSWER }),
  event(4, "attempt.finished", { attempt_id: "att_1", node_id: "n_1", outcome: "completed" }),
];

/** The task's events arrive once through a fake EventSource, which then stays open (no reconnect banner); `window.__push` sends one more. */
async function mockBackend(page: Page, feed: unknown[], status = "COMPLETED") {
  await page.addInitScript((items) => {
    class FakeEventSource {
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        setTimeout(() => {
          this.onopen?.({});
          for (const item of items) this.onmessage?.({ data: JSON.stringify(item) });
          Object.assign(window, { __push: (item: unknown) => this.onmessage?.({ data: JSON.stringify(item) }) });
        }, 20);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, feed);
  await page.route(IMAGE_URL, (route) => route.fulfill({ body: CHART, contentType: "image/svg+xml" }));
  await page.route("**/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (pathname === "/v1/tasks") return json({ items: [{ ...task, status }] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json({ ...task, status });
    if (pathname.endsWith("/plan")) return json(plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [] });
    if (pathname.endsWith("/config")) return json({ config_version: 1, expert: "writer@1", skills: null, connector_ids: null, mode: "default" });
    if (pathname === "/v1/experts") return json({ items: [] });
    if (pathname === "/v1/models") return json({ items: ["test-model"], default: "test-model" });
    return json({ items: [], total: 0 });
  });
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    test.describe(`markdown @ ${theme} ${viewport.name}`, () => {
      const phone = viewport.width < 640;
      test.use({ viewport: { width: viewport.width, height: viewport.height }, ...(phone ? { hasTouch: true, isMobile: true } : {}), permissions: ["clipboard-read", "clipboard-write"] });

      test("code, table, diagram, math and image render", async ({ page }) => {
        await page.addInitScript((name) => localStorage.setItem("orbit.uiPrefs", JSON.stringify(name === "dark" ? { theme: "深色" } : {})), theme);
        await mockBackend(page, events);
        await page.goto(`/tasks/${TASK_ID}`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const answer = page.getByTestId("final-output");
        await expect(answer).toBeVisible();

        // M1/M2: the TypeScript block has a 36px header with the language, a wrap toggle and copy.
        const block = answer.getByTestId("code-block").first();
        await expect(block).toHaveAttribute("data-language", "ts");
        await expect(block.getByText("ts", { exact: true })).toBeVisible();
        const header = block.locator("> div").first();
        expect((await header.boundingBox())?.height).toBeCloseTo(36, 0);
        const body = block.getByTestId("code-body");
        const wrap = block.getByRole("button", { name: "自动换行" });
        await expect(wrap).toHaveAttribute("aria-pressed", "false");
        expect(await body.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre");
        // Highlighting loads lazily: wait for the first token span.
        await expect(body.locator("code .hljs-keyword").first()).toBeVisible();
        const scrolls = await body.evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(scrolls, "a long line scrolls sideways when not wrapped").toBe(true);
        await wrap.click();
        await expect(wrap).toHaveAttribute("aria-pressed", "true");
        expect(await body.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");
        expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await block.getByRole("button", { name: "复制代码" }).click();
        await expect(block.getByRole("button", { name: "已复制" })).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("items.reduce(");
        await expect(block.getByRole("button", { name: "复制代码" })).toBeVisible({ timeout: 4000 });

        // M6: a `$` in a shell command stays literal.
        const shell = answer.getByTestId("code-block").nth(1);
        await expect(shell).toContainText('echo "$HOME is $USER"');
        await expect(shell.locator(".katex")).toHaveCount(0);

        // M3: the wide table scrolls inside its wrapper; the page does not.
        const wrapper = answer.locator(".md-table-wrap").first();
        await wrapper.scrollIntoViewIfNeeded();
        await expect(wrapper.locator("th").first()).toHaveCSS("padding-top", "8px");
        await expect(wrapper.locator("th").first()).toHaveCSS("padding-left", "10px");
        if (phone) expect(await wrapper.evaluate((el) => el.scrollWidth > el.clientWidth), "the table scrolls inside its wrapper").toBe(true);
        expect(await wrapper.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
        await expect(wrapper.locator("td").last()).toHaveCSS("font-variant-numeric", "tabular-nums");

        // M4: the Mermaid fence is drawn.
        await expect(answer.getByTestId("mermaid").locator("svg")).toBeVisible({ timeout: 20_000 });

        // M5: both display forms and both inline forms go through KaTeX.
        await expect.poll(() => answer.locator(".katex-display").count()).toBe(2);
        await expect.poll(() => answer.locator(".katex:not(.katex-display .katex)").count()).toBe(2);
        // KaTeX keeps the TeX source in a hidden MathML annotation, so read what is shown, not the text content.
        await expect(answer).not.toContainText("\\frac{n(n+1)}{2}", { useInnerText: true });
        await expect(answer).not.toContainText("\\[", { useInnerText: true });

        // M7: the image is blocked until loaded; then it opens a lightbox that Esc closes.
        await expect(answer.getByTestId("blocked-image")).toBeVisible();
        await answer.getByRole("button", { name: "加载图片" }).click();
        await answer.getByRole("button", { name: /查看大图/ }).click();
        await expect(page.getByTestId("image-lightbox")).toBeVisible();
        await page.screenshot({ path: shotPath(theme, viewport.name, "lightbox") });
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("image-lightbox")).toHaveCount(0);

        // Links open in a new tab without handing the page to the target.
        const link = answer.getByRole("link", { name: "发布手册" });
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /noopener noreferrer/);

        // M3 again, for the whole page, with everything rendered.
        const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(scroll, `page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner);

        // The conversation scrolls inside the page, so the whole answer is captured by making the window tall.
        await page.screenshot({ path: shotPath(theme, viewport.name, "viewport") });
        await page.setViewportSize({ width: viewport.width, height: phone ? 3600 : 2200 });
        await page.waitForTimeout(200);
        await page.screenshot({ path: shotPath(theme, viewport.name, "answer") });
      });
    });
  }
}

function shotPath(theme: string, size: string, name: string) {
  mkdirSync(OUT, { recursive: true });
  return join(OUT, `${theme}-${size}-${name}.png`);
}

test.describe("markdown streaming", () => {
  test("a growing code block keeps its text, a finished block does not remount, and Mermaid waits for its closed fence", async ({ page }) => {
    await mockBackend(page, events.slice(0, 2), "RUNNING");
    await page.goto(`/tasks/${TASK_ID}`);
    await page.waitForFunction(() => "__push" in window);
    const delta = (n: number, text: string) => ({ ...event(0, "agent.token_delta", { attempt_id: "att_1", block_id: "b1", text }), event_id: `eph_${n}`, after_seq: 2 });
    const push = (n: number, text: string) => page.evaluate((item) => (window as unknown as { __push: (item: unknown) => void }).__push(item), delta(n, text));
    const live = page.getByTestId("live-output");

    await push(1, "先说明一下。\n\n```ts\nconst a = 1;\n");
    const first = live.getByTestId("code-block").first();
    await expect(first).toContainText("const a = 1;");
    // Tag the DOM node: a remount of the finished block would drop the tag.
    await first.evaluate((el) => el.setAttribute("data-probe", "kept"));
    await push(2, "const b = 2;\n");
    await expect(first).toContainText("const b = 2;");
    await push(3, "const c = 3;\n```\n\n```mermaid\ngraph TD\n  A-->B\n");
    await expect(first).toContainText("const c = 3;");
    // The open Mermaid fence shows as source, not as a diagram.
    await expect(live.getByTestId("code-block").nth(1)).toHaveAttribute("data-language", "mermaid");
    await expect(live.getByTestId("mermaid")).toHaveCount(0);
    // Wait out the highlighter's settle delay: the finished block is highlighted, in full.
    await expect(first.locator(".hljs-keyword").first()).toBeVisible();
    await push(4, "```\n\n收尾。");
    await expect(live).toContainText("收尾。");
    await expect(first).toHaveAttribute("data-probe", "kept");
    await expect(first.getByTestId("code-body")).toHaveText(/const a = 1;\s*const b = 2;\s*const c = 3;/);
  });
});
