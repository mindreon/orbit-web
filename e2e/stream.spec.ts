/**
 * Targeted E2E for the task chat stream: draft clearing on reconnect, `reset` handling, and the security rules
 * for rendered assistant content. Runs the real app against e2e/fake-control.mjs and records trace, video and
 * screenshots under test-results/.
 *
 * Ways this can fail (each is asserted below):
 * Reconnect
 *   F1 a delta whose seq is lower than one already applied (out of order) is spliced in instead of dropped.
 *   F2 a repeated delta (same turnId, blockId, seq, activityAttempt) is appended twice.
 *   F3 a new activityAttempt keeps the previous attempt's partial text.
 *   F4 after the stream drops and reconnects, the unfinished draft is still on screen.
 *   F5 after reconnect, late deltas of that block rebuild a draft that starts mid-sentence.
 *   F6 the reconnect request does not carry Last-Event-ID (header, and lastEventId query fallback).
 *   F7 an event the server replays after reconnect is rendered twice.
 *   F8 the final assistant.message is shown next to the draft instead of replacing it.
 *   F9 the client never reconnects after the connection drops.
 *   F10 an unknown event type breaks rendering instead of being ignored.
 *   F11 the conversation blanks out while the stream is down.
 *   F12 an event the client missed while disconnected never shows up (the server did not replay it).
 *   F13 (C33) the delta chunk `seq` and the SSE `id:` (event id) get mixed: Last-Event-ID carries a JSON id or a chunk
 *       seq; a replayed durable frame with an already-seen SSE id is applied again; or delta frames, which repeat the
 *       last durable event's SSE id, are dropped as replays.
 *   F14 a tool.result with `truncated: true` gives no hint that the text was cut at 4KB.
 *   F15 modelMode "mock" / "real" is not shown as 假模型 / 真模型.
 * Reset
 *   R1 `event: reset` is ignored and stale items stay.
 *   R2 reset does not refetch /activity.
 *   R3 items received before the reset survive the rebuild.
 *   R4 a draft survives the reset.
 *   R5 a reset sent as `data: {"type":"reset"}` is not recognised.
 *   R6 events after the rebuild are dropped or duplicated.
 * Security (rendered assistant Markdown, Mermaid, KaTeX)
 *   S1 raw HTML from the model becomes live DOM: a <script> element, or an on* event attribute.
 *   S2 a javascript: URL survives as a link, from Markdown, raw HTML or KaTeX \href.
 *   S3 an external link opens without rel="noopener noreferrer".
 *   S4 a remote image loads before the reader clicks, or loads with a Referer header.
 *   S5 a Mermaid label smuggles markup into the rendered SVG.
 *   S6 anything in the answer runs script (a dialog opens).
 * Performance
 *   P1 a 1000-message conversation mounts every message instead of a window of rows.
 *   P2 the long conversation does not open at the latest message.
 *   P3 while deltas stream, React commits more than once in a single animation frame.
 *   P4 batching per frame loses or reorders streamed text.
 */
import { expect, test } from "@playwright/test";
import { activity, assistant, control, delta, draft, emit, log, metrics, openRoom, shot, toolRows, waitForStreams } from "./helpers";

test.beforeEach(async ({ request }) => {
  await control(request, "/__test/clear");
});

const toolCall = (sequence: number) =>
  activity("ev-2", sequence, { type: "tool.call", toolName: "execute_shell_command", callId: "c1", turnId: "tn-1", argsPreview: '{"command": "ls -la"}' });

test("reconnect clears unfinished drafts and waits for the final message", { tag: ["@acc-1", "@acc-2", "@acc-4", "@acc-5", "@acc-11"] }, async ({ page, request }) => {
  // JSON ids ("ev-…") and delta chunk seqs (1, 2, 3…) deliberately differ from the SSE ids (per-task sequence).
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "user", text: "介绍一下你自己", turnId: "tn-1", modelMode: "mock" })],
  });
  await openRoom(page, request);
  // F13: resume starts from the snapshot's per-task sequence, never from the JSON id.
  expect((await log(request)).events[0].lastEventIdHeader).toBe("1");
  await expect(page.getByText("介绍一下你自己")).toBeVisible();
  await expect(page.getByTestId("model-mode")).toHaveText("假模型"); // F15

  // F1 + F2: chunk seq 2 arrives after seq 3 and is dropped; seq 3 arrives twice. F13: every chunk frame repeats the
  // last durable event's SSE id ("1"), so deduping deltas by SSE id would drop all of them.
  const chunkIds = await emit(request, [
    { data: delta("tn-1", "b1", 1, "你好，") },
    { data: delta("tn-1", "b1", 3, "世界") },
    { data: delta("tn-1", "b1", 2, "（迟到的块）") },
    { data: delta("tn-1", "b1", 3, "世界") },
  ]);
  expect(chunkIds).toEqual(["1", "1", "1", "1"]);
  await expect(draft(page)).toHaveText("你好，世界");
  await expect(page.getByText("迟到的块")).toHaveCount(0);

  // F3: attempt 2 of the same turn discards attempt 1's partial text.
  await emit(request, { data: delta("tn-1", "b2", 1, "旧的尝试") });
  await expect(page.getByText("旧的尝试")).toBeVisible();
  await emit(request, { data: delta("tn-1", "b3", 1, "新的尝试", 2) });
  await expect(page.getByText("旧的尝试")).toHaveCount(0);
  await expect(page.getByText("你好，世界")).toHaveCount(0);
  await expect(draft(page)).toHaveText("新的尝试");
  await emit(request, { data: delta("tn-1", "b1", 4, "迟到的旧尝试") });
  await expect(page.getByText("迟到的旧尝试")).toHaveCount(0);

  // F10: unknown event types are ignored.
  await emit(request, { data: activity("ev-x", 0, { type: "mystery.event", text: "不应出现" }) });

  const [callId] = await emit(request, { data: toolCall(0) });
  await expect(toolRows(page)).toHaveCount(1);
  await expect(toolRows(page).first()).toContainText("执行命令");
  await expect(page.getByText("不应出现")).toHaveCount(0);
  await shot(page, "before-drop");

  // F12: while the client is disconnected the tool finishes; the server will not replay that event.
  const call = Number(callId);
  await control(request, "/__test/activity", {
    items: [
      activity("ev-1", 1, { type: "assistant.message", role: "user", text: "介绍一下你自己", turnId: "tn-1", modelMode: "mock" }),
      toolCall(call),
      activity("ev-2b", call + 1, {
        type: "tool.result",
        toolName: "execute_shell_command",
        callId: "c1",
        turnId: "tn-1",
        toolState: "success",
        text: "total 0",
        truncated: true,
      }),
    ],
  });
  // F9 + F6: drop, the client reconnects with Last-Event-ID.
  await control(request, "/__test/drop");
  // F11: nothing already shown disappears while the stream is down.
  await expect(page.getByText("介绍一下你自己")).toBeVisible();
  await expect(toolRows(page)).toHaveCount(1);
  await waitForStreams(request, 2);
  const second = (await log(request)).events[1];
  // F13: the last SSE id received, not the JSON id "ev-2" and not a chunk seq.
  expect(second.lastEventIdHeader).toBe(callId);
  expect(second.lastEventIdQuery).toBe(callId);

  // F4: the unfinished draft is gone.
  await expect(draft(page)).toHaveCount(0);
  await expect(page.getByText("新的尝试")).toHaveCount(0);

  // F7 + F13: the server replays the tool call with its original SSE id; it is recognised by that id.
  await emit(request, { id: callId, data: toolCall(call) });
  // F5: a late delta of the abandoned block does not come back as a partial draft.
  await emit(request, { data: delta("tn-1", "b3", 2, "后半句", 2) });
  await expect(draft(page)).toHaveCount(0);
  await expect(page.getByText("后半句")).toHaveCount(0);
  await expect(toolRows(page)).toHaveCount(1);
  await expect(toolRows(page).first()).toHaveAttribute("data-state", "success");

  // F14: the expanded detail says the result was cut.
  await toolRows(page).first().getByRole("button").first().click();
  await expect(toolRows(page).first()).toContainText("已截断");

  // F8: the final message shows exactly once, with no draft next to it.
  await emit(request, {
    data: activity("ev-3", 0, { type: "assistant.message", role: "assistant", turnId: "tn-1", blockId: "b3", text: "新的尝试后半句，这是完整回答。" }),
  });
  await expect(assistant(page)).toHaveCount(1);
  await expect(assistant(page).first()).toContainText("新的尝试后半句，这是完整回答。");
  await expect(draft(page)).toHaveCount(0);
  await shot(page, "after-reconnect");
});

test("reset refetches /activity and rebuilds the conversation", { tag: ["@acc-4", "@acc-5", "@acc-11"] }, async ({ page, request }) => {
  await control(request, "/__test/activity", {
    items: [
      activity("ev-1", 1, { type: "assistant.message", role: "user", text: "第一条问题", turnId: "tn-1" }),
      activity("ev-2", 2, { type: "assistant.message", role: "assistant", text: "旧回答", turnId: "tn-1" }),
    ],
  });
  await openRoom(page, request);
  await expect(page.getByText("旧回答")).toBeVisible();

  await emit(request, [
    { data: activity("ev-3", 0, { type: "assistant.message", role: "assistant", text: "流里的新消息", turnId: "tn-2" }) },
    { data: delta("tn-3", "b9", 1, "半截草稿") },
  ]);
  await expect(page.getByText("流里的新消息")).toBeVisible();
  await expect(draft(page)).toHaveText("半截草稿");
  const fetchesBefore = (await log(request)).activity;

  // R1-R4: server history is rewritten, then `event: reset` (no data).
  await control(request, "/__test/activity", {
    items: [
      activity("ev-a", 1, { type: "assistant.message", role: "user", text: "重建后的问题", turnId: "tn-a", modelMode: "real" }),
      activity("ev-b", 2, { type: "assistant.message", role: "assistant", text: "重建后的回答", turnId: "tn-a", modelMode: "real" }),
    ],
  });
  await emit(request, { event: "reset" });
  await expect(page.getByText("重建后的回答")).toBeVisible();
  await expect.poll(async () => (await log(request)).activity).toBeGreaterThan(fetchesBefore);
  for (const stale of ["第一条问题", "旧回答", "流里的新消息", "半截草稿"]) {
    await expect(page.getByText(stale)).toHaveCount(0);
  }
  await expect(draft(page)).toHaveCount(0);
  await expect(page.getByTestId("model-mode")).toHaveText("真模型"); // F15
  await shot(page, "after-event-reset");

  // R5: reset as a data frame.
  const fetchesMid = (await log(request)).activity;
  await control(request, "/__test/activity", {
    items: [activity("ev-z", 1, { type: "assistant.message", role: "assistant", text: "第二次重建", turnId: "tn-z" })],
  });
  await emit(request, { data: { type: "reset" } });
  await expect(page.getByText("第二次重建")).toBeVisible();
  await expect(page.getByText("重建后的回答")).toHaveCount(0);
  expect((await log(request)).activity).toBeGreaterThan(fetchesMid);

  // R6: the stream keeps working after the rebuild; a frame replayed with the same SSE id is not applied twice.
  const message = (sequence: number) =>
    activity("ev-y", sequence, { type: "assistant.message", role: "assistant", text: "重建之后的新消息", turnId: "tn-y" });
  const [nextId] = await emit(request, { data: message(0) });
  await emit(request, { id: nextId, data: message(Number(nextId)) });
  await expect(page.getByText("重建之后的新消息")).toHaveCount(1);
  await expect(assistant(page)).toHaveCount(2);
  await shot(page, "after-data-reset");
});

const HOSTILE_ANSWER = [
  "原始 HTML：<script>window.__pwned = 1; alert('script')</script> <img src=x onerror=\"alert('img')\"> <a href=\"javascript:alert('a')\">坏链接</a>",
  "",
  "[Markdown 坏链接](javascript:alert('md'))，[官网](https://example.com/docs)",
  "",
  "![对方 logo](https://tracker.example.com/pixel.png?u=42)",
  "",
  "公式：$\\href{javascript:alert('katex')}{点我}$ 和 $E = mc^2$",
  "",
  "```html",
  "<script>alert('code')</script>",
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[\"<img src=x onerror=alert('mmd')>开始\"] --> B[结束]",
  "```",
].join("\n");

test("assistant content is rendered inert: no script, handlers, javascript: links or silent image loads", { tag: ["@acc-8"] }, async ({ page, request }) => {
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
  await control(request, "/__test/activity", {
    items: [
      activity("ev-1", 1, { type: "assistant.message", role: "user", text: "把对方发来的内容原样整理一下", turnId: "tn-s" }),
      activity("ev-2", 2, { type: "assistant.message", role: "assistant", text: HOSTILE_ANSWER, turnId: "tn-s" }),
    ],
  });
  await openRoom(page, request);
  const answer = assistant(page).first();
  await expect(answer).toContainText("原始 HTML：<script>");
  await expect(answer.locator(".md-mermaid svg")).toHaveCount(1);
  await expect(answer.locator(".katex").first()).toBeVisible();

  const audit = await page.getByTestId("chat-scroll").evaluate((root) => {
    const elements = [root, ...root.querySelectorAll("*")];
    return {
      scripts: root.querySelectorAll("script").length,
      handlers: elements.flatMap((el) => [...el.attributes].filter((attr) => attr.name.toLowerCase().startsWith("on")).map((attr) => `${el.tagName}.${attr.name}`)),
      jsLinks: elements
        .flatMap((el) => ["href", "src", "xlink:href", "action", "formaction"].map((name) => el.getAttribute(name) ?? ""))
        .filter((value) => value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase().startsWith("javascript:")),
      links: [...root.querySelectorAll(".md a[href]")].map((a) => ({ href: a.getAttribute("href"), rel: a.getAttribute("rel") ?? "" })),
      images: root.querySelectorAll("img").length,
    };
  });
  expect(audit.scripts).toBe(0); // S1
  expect(audit.handlers).toEqual([]); // S1 + S5
  expect(audit.jsLinks).toEqual([]); // S2
  expect(audit.links.length).toBeGreaterThan(0);
  for (const link of audit.links) {
    expect(link.rel).toContain("noopener"); // S3
    expect(link.rel).toContain("noreferrer");
  }

  // S4: nothing loads until the reader asks, and then without a Referer.
  expect(audit.images).toBe(0);
  expect(imageRequests).toEqual([]);
  const blocked = page.getByTestId("blocked-image");
  await expect(blocked).toContainText("tracker.example.com/pixel.png");
  await blocked.getByRole("button", { name: "加载图片" }).click();
  const image = answer.locator('img[src^="https://tracker.example.com/"]');
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect.poll(() => imageRequests.length).toBe(1);
  expect(imageRequests[0]).toBeNull();

  // S6
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(dialogs).toEqual([]);
  await shot(page, "security", { fullPage: true });
});

test("1000 messages stay virtualized and streaming commits at most once per frame", { tag: ["@acc-9"] }, async ({ page, request }) => {
  const history = Array.from({ length: 1000 }, (_, index) =>
    activity(`ev-${index + 1}`, index + 1, {
      type: "assistant.message",
      role: index % 2 === 0 ? "user" : "assistant",
      text: index % 2 === 0 ? `第 ${index / 2 + 1} 个问题` : `第 ${(index + 1) / 2} 条回答：先核对**主体信息**，再看 \`条款\`。`,
      turnId: `tn-${Math.floor(index / 2)}`,
    }),
  );
  await control(request, "/__test/activity", { items: history });
  // Count React commits through the DevTools hook, which React calls once per commit.
  await page.addInitScript(() => {
    const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
    w.__commits = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => {
        w.__commits += 1;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });
  await openRoom(page, request);
  await expect(page.getByText("第 500 条回答")).toBeVisible();

  const mounted = await page.locator('[data-testid="chat-item"]').count();
  expect(mounted).toBeLessThan(60); // P1
  const distance = await page.getByTestId("chat-scroll").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  expect(distance).toBeLessThan(64); // P2

  await page.evaluate(() => {
    const w = window as unknown as { __commits: number; __maxPerFrame: number; __frames: number };
    let seen = w.__commits;
    w.__maxPerFrame = 0;
    w.__frames = 0;
    const tick = () => {
      w.__frames += 1;
      w.__maxPerFrame = Math.max(w.__maxPerFrame, w.__commits - seen);
      seen = w.__commits;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const chunks = Array.from({ length: 300 }, (_, index) => `片段${index + 1}${(index + 1) % 30 === 0 ? "\n\n" : " "}`);
  for (let burst = 0; burst < 6; burst += 1) {
    await emit(
      request,
      chunks.slice(burst * 50, burst * 50 + 50).map((text, offset) => ({ data: delta("tn-live", "b-live", burst * 50 + offset + 1, text) })),
    );
  }
  await expect(draft(page)).toContainText("片段300");
  await page.waitForTimeout(300);
  const stats = await page.evaluate(() => {
    const w = window as unknown as { __maxPerFrame: number; __frames: number };
    return { max: w.__maxPerFrame, frames: w.__frames };
  });
  expect(stats.frames).toBeGreaterThan(0);
  await metrics({ mountedRowsOf1000: mounted, streamingFrames: stats.frames, maxCommitsPerFrame: stats.max });
  expect(stats.max).toBeLessThanOrEqual(1); // P3
  const text = (await draft(page).textContent()) ?? "";
  expect(text.replace(/\s+/g, "")).toBe(chunks.join("").replace(/\s+/g, "")); // P4
});
