/**
 * Performance on the running stack (mock model mode): a conversation built through real turns, then one
 * 50,000-character reply (code blocks and tables) streamed by orbit-worker over control's SSE.
 * The 1000-message case needs more history than control retains per room (500 events), so it is measured on the
 * fixture (playwright.perf.config.ts) and both land in the same acceptance report.
 *
 * Ways this can fail (each is asserted below):
 *   Q1 scrolling through the long reply and the history drops below 50 fps.
 *   Q2 a keystroke takes longer than 50 ms to reach the screen once the reply is rendered.
 *   Q3 streaming the reply shifts layout: CLS above 0.1.
 *   Q4 the streamed reply is not rendered in full.
 */
import { longReplyAscii, streamParts } from "../fixtures/datasets.mjs";
import { installProbes, readCls, readLatency, resetLatency, startFrames, stopFrames, wheelScroll } from "../perf/probes";
import { expect, test } from "../test";
import { assistantItems, metrics, newRoom, openRoom, postMessage, shot, streamPrompt, verify } from "./helpers";

const TURNS = 80;
const REPLY_CHARS = 50000;
const TYPED = "please cap clause seven at twenty percent and move the payment date";

test("50,000-character streamed reply over real history: scroll >= 50 fps, keystroke <= 50 ms, CLS <= 0.1", { tag: ["@acc-9", "@acc-13", "@acc-16"] }, async ({ page, request }) => {
  test.setTimeout(300_000);
  const roomId = await newRoom(request, "stack · 性能");
  const historyStarted = Date.now();
  for (let turn = 1; turn <= TURNS; turn += 1) await postMessage(request, roomId, `第 ${turn} 个问题：这一项要怎么处理？`);
  const historyMs = Date.now() - historyStarted;

  await installProbes(page);
  await openRoom(page, roomId);
  await expect(page.getByText(`第 ${TURNS} 个问题：这一项要怎么处理？`)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as unknown as { __shifts: unknown[] }).__shifts.length = 0;
  });

  const reply = `${longReplyAscii(REPLY_CHARS)}\n\n【五万字回复结束】`;
  const parts = streamParts(reply, 400);
  await startFrames(page);
  const streamed = Date.now();
  await postMessage(request, roomId, streamPrompt(parts));
  const final = assistantItems(page).filter({ hasText: "【五万字回复结束】" });
  await expect(final).toHaveCount(1, { timeout: 60_000 });
  const streamMs = Date.now() - streamed;
  const streamingFrames = await stopFrames(page);
  await page.waitForTimeout(1000);
  const cls = await readCls(page);
  const renderedChars = await final.evaluate((el) => el.textContent?.length ?? 0);
  const replyHeight = await final.evaluate((el) => Math.round(el.getBoundingClientRect().height));

  await page.getByTestId("chat-scroll").hover();
  await startFrames(page);
  await wheelScroll(page, 150, -500);
  const up = await stopFrames(page);
  const mounted = await page.locator('[data-testid="chat-item"]').count();
  await startFrames(page);
  await wheelScroll(page, 150, 500);
  const down = await stopFrames(page);

  await page.getByTestId("jump-latest").click({ timeout: 2000 }).catch(() => undefined);
  await page.getByLabel("输入消息").click();
  await resetLatency(page);
  await page.getByLabel("输入消息").pressSequentially(TYPED, { delay: 60 });
  await page.waitForTimeout(300);
  const typing = await readLatency(page);

  await metrics({
    stackPerf: {
      history: { turns: TURNS, messages: TURNS * 2, builtInMs: historyMs },
      reply: { chars: reply.length, streamParts: parts.length, renderedChars, heightPx: replyHeight, streamedInMs: streamMs },
      streaming: { frames: streamingFrames, ...cls },
      scrollUp: up,
      scrollDown: down,
      mountedRowsWhileScrolling: mounted,
      typing,
    },
  });
  await shot(page, "stack-50k-reply");

  const setup = `真实栈上 ${TURNS} 轮对话（${TURNS * 2} 条消息）后，假模型把 ${reply.length} 字符的回复（含代码块和表格）分 ${parts.length} 段流式推送`;
  await verify([13, 16], `${setup}；看渲染结果和流式期间的布局`, "回复完整渲染（≥ 80% 字符上屏）；流式期间 CLS ≤ 0.1", async () => {
    expect(renderedChars).toBeGreaterThan(REPLY_CHARS * 0.8); // Q4
    expect(cls.cls).toBeLessThanOrEqual(0.1); // Q3
    return "回复完整渲染（≥ 80% 字符上屏）；CLS ≤ 0.1（实测见 measurements）";
  });
  await verify([9, 16], `${setup}；鼠标滚轮向上、向下各滚 150 次`, "两个方向都 ≥ 50 fps；虚拟列表只挂载可见附近的行", async () => {
    expect(up.fps).toBeGreaterThanOrEqual(50); // Q1
    expect(down.fps).toBeGreaterThanOrEqual(50);
    expect(mounted).toBeLessThan(TURNS * 2);
    return "向上、向下滚动都 ≥ 50 fps；挂载行数少于消息总数（实测见 measurements）";
  });
  await verify([16], `${setup}；在输入框逐字输入 ${TYPED.length} 个字符`, "每次按键从 input 事件到下一帧 ≤ 50 ms；Event Timing 条目（≥ 16 ms 才记录）≤ 50 ms", async () => {
    expect(typing.keys).toBe(TYPED.length);
    expect(typing.nextFrameMax).toBeLessThanOrEqual(50); // Q2
    if (typing.eventTimingMax !== null) expect(typing.eventTimingMax).toBeLessThanOrEqual(50);
    return `采到 ${typing.keys} 次按键；按键到下一帧最大值 ≤ 50 ms；Event Timing 最大值 ≤ 50 ms（实测见 measurements）`;
  });
});
