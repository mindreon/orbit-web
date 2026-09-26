/**
 * Targeted E2E for the task chat stream: draft clearing on reconnect, and `reset` handling.
 * Runs the real app against e2e/fake-control.mjs and records trace, video and screenshots under test-results/.
 *
 * Ways this can fail (each is asserted below):
 * Reconnect
 *   F1 deltas arriving out of seq order render in arrival order instead of seq order.
 *   F2 a repeated delta (same turnId, blockId, seq, activityAttempt) is appended twice.
 *   F3 a new activityAttempt keeps the previous attempt's partial text.
 *   F4 after the stream drops and reconnects, the unfinished draft is still on screen.
 *   F5 after reconnect, late deltas of that block rebuild a draft that starts mid-sentence.
 *   F6 the reconnect request does not carry Last-Event-ID (header, and lastEventId query fallback).
 *   F7 an event the server replays after reconnect is rendered twice.
 *   F8 the final assistant.message is shown next to the draft instead of replacing it.
 *   F9 the client never reconnects after the connection drops.
 *   F10 an unknown event type breaks rendering instead of being ignored.
 * Reset
 *   R1 `event: reset` is ignored and stale items stay.
 *   R2 reset does not refetch /activity.
 *   R3 items received before the reset survive the rebuild.
 *   R4 a draft survives the reset.
 *   R5 a reset sent as `data: {"type":"reset"}` is not recognised.
 *   R6 events after the rebuild are dropped or duplicated.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const CONTROL = "http://127.0.0.1:18080";
const ROOM = "room-e2e";

type Frame = { id?: string; event?: string; data?: unknown };

function activity(id: string, sequence: number, patch: Record<string, unknown>) {
  return {
    id,
    sequence,
    roomId: ROOM,
    sessionId: "ses-e2e",
    source: "worker",
    agentId: "main",
    agentPath: "main",
    occurredAt: new Date(Date.UTC(2026, 8, 26, 8, 0, sequence)).toISOString(),
    ...patch,
  };
}

function delta(turnId: string, blockId: string, seq: number, text: string, activityAttempt = 1) {
  return {
    type: "assistant.delta",
    roomId: ROOM,
    sessionId: "ses-e2e",
    agentId: "main",
    agentPath: "main",
    turnId,
    blockId,
    seq,
    activityAttempt,
    delta: text,
  };
}

async function control(request: APIRequestContext, path: string, body?: unknown) {
  const response = await request.post(`${CONTROL}${path}`, { data: body ?? {} });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function emit(request: APIRequestContext, frames: Frame | Frame[]) {
  const result = await control(request, "/__test/emit", frames);
  expect(result.delivered).toBeGreaterThan(0);
}

async function log(request: APIRequestContext) {
  const response = await request.get(`${CONTROL}/__test/log`);
  return (await response.json()) as {
    events: { lastEventIdHeader: string | null; lastEventIdQuery: string | null }[];
    activity: number;
    open: number;
  };
}

async function waitForStreams(request: APIRequestContext, count: number) {
  await expect.poll(async () => {
    const current = await log(request);
    return current.open > 0 ? current.events.length : 0;
  }).toBe(count);
}

async function openRoom(page: Page, request: APIRequestContext) {
  await page.goto(`/task/${ROOM}`);
  await waitForStreams(request, 1);
}

const draft = (page: Page) => page.getByTestId("assistant-draft");
const assistant = (page: Page) => page.locator('[data-testid="chat-item"][data-kind="assistant"]');
const toolRows = (page: Page) => page.getByTestId("tool-row");

test.beforeEach(async ({ request }) => {
  await control(request, "/__test/clear");
});

test("reconnect clears unfinished drafts and waits for the final message", async ({ page, request }) => {
  await control(request, "/__test/activity", {
    items: [activity("ev-1", 1, { type: "assistant.message", role: "user", text: "介绍一下你自己", turnId: "tn-1" })],
  });
  await openRoom(page, request);
  expect((await log(request)).events[0].lastEventIdHeader).toBe("ev-1");
  await expect(page.getByText("介绍一下你自己")).toBeVisible();

  // F1 + F2: seq 2 arrives first, seq 1 arrives twice.
  await emit(request, [
    { data: delta("tn-1", "b1", 2, "世界") },
    { data: delta("tn-1", "b1", 1, "你好，") },
    { data: delta("tn-1", "b1", 1, "你好，") },
  ]);
  await expect(draft(page)).toHaveText("你好，世界");

  // F3: attempt 2 of the same turn discards attempt 1's partial text.
  await emit(request, { data: delta("tn-1", "b2", 1, "旧的尝试") });
  await expect(page.getByText("旧的尝试")).toBeVisible();
  await emit(request, { data: delta("tn-1", "b3", 1, "新的尝试", 2) });
  await expect(page.getByText("旧的尝试")).toHaveCount(0);
  await expect(page.getByText("你好，世界")).toHaveCount(0);
  await expect(draft(page)).toHaveText("新的尝试");
  await emit(request, { data: delta("tn-1", "b1", 3, "迟到的旧尝试") });
  await expect(page.getByText("迟到的旧尝试")).toHaveCount(0);

  // F10: unknown event types are ignored.
  await emit(request, { id: "ev-x", data: { ...activity("ev-x", 2, { type: "mystery.event", text: "不应出现" }) } });

  await emit(request, {
    id: "ev-2",
    data: activity("ev-2", 3, { type: "tool.call", toolName: "execute_shell_command", callId: "c1", turnId: "tn-1", argsPreview: '{"command": "ls -la"}' }),
  });
  await expect(toolRows(page)).toHaveCount(1);
  await expect(toolRows(page).first()).toContainText("执行命令");
  await expect(page.getByText("不应出现")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("before-drop.png") });

  // F9 + F6: drop, the client reconnects with Last-Event-ID.
  await control(request, "/__test/drop");
  await waitForStreams(request, 2);
  const second = (await log(request)).events[1];
  expect(second.lastEventIdHeader).toBe("ev-2");
  expect(second.lastEventIdQuery).toBe("ev-2");

  // F4: the unfinished draft is gone.
  await expect(draft(page)).toHaveCount(0);
  await expect(page.getByText("新的尝试")).toHaveCount(0);

  // F7: the server replays ev-2 after reconnect.
  await emit(request, {
    id: "ev-2",
    data: activity("ev-2", 3, { type: "tool.call", toolName: "execute_shell_command", callId: "c1", turnId: "tn-1", argsPreview: '{"command": "ls -la"}' }),
  });
  // F5: a late delta of the abandoned block does not come back as a partial draft.
  await emit(request, { data: delta("tn-1", "b3", 2, "后半句", 2) });
  await expect(draft(page)).toHaveCount(0);
  await expect(page.getByText("后半句")).toHaveCount(0);
  await expect(toolRows(page)).toHaveCount(1);

  // F8: the final message shows exactly once, with no draft next to it.
  await emit(request, {
    id: "ev-3",
    data: activity("ev-3", 4, { type: "assistant.message", role: "assistant", turnId: "tn-1", blockId: "b3", text: "新的尝试后半句，这是完整回答。" }),
  });
  await expect(assistant(page)).toHaveCount(1);
  await expect(assistant(page).first()).toContainText("新的尝试后半句，这是完整回答。");
  await expect(draft(page)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("after-reconnect.png") });
});

test("reset refetches /activity and rebuilds the conversation", async ({ page, request }) => {
  await control(request, "/__test/activity", {
    items: [
      activity("ev-1", 1, { type: "assistant.message", role: "user", text: "第一条问题", turnId: "tn-1" }),
      activity("ev-2", 2, { type: "assistant.message", role: "assistant", text: "旧回答", turnId: "tn-1" }),
    ],
  });
  await openRoom(page, request);
  await expect(page.getByText("旧回答")).toBeVisible();

  await emit(request, [
    { id: "ev-3", data: activity("ev-3", 3, { type: "assistant.message", role: "assistant", text: "流里的新消息", turnId: "tn-2" }) },
    { data: delta("tn-3", "b9", 1, "半截草稿") },
  ]);
  await expect(page.getByText("流里的新消息")).toBeVisible();
  await expect(draft(page)).toHaveText("半截草稿");
  const fetchesBefore = (await log(request)).activity;

  // R1-R4: server history is rewritten, then `event: reset` (no data).
  await control(request, "/__test/activity", {
    items: [
      activity("ev-a", 1, { type: "assistant.message", role: "user", text: "重建后的问题", turnId: "tn-a" }),
      activity("ev-b", 2, { type: "assistant.message", role: "assistant", text: "重建后的回答", turnId: "tn-a" }),
    ],
  });
  await emit(request, { id: "reset-1", event: "reset" });
  await expect(page.getByText("重建后的回答")).toBeVisible();
  await expect.poll(async () => (await log(request)).activity).toBeGreaterThan(fetchesBefore);
  for (const stale of ["第一条问题", "旧回答", "流里的新消息", "半截草稿"]) {
    await expect(page.getByText(stale)).toHaveCount(0);
  }
  await expect(draft(page)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("after-event-reset.png") });

  // R5: reset as a data frame.
  const fetchesMid = (await log(request)).activity;
  await control(request, "/__test/activity", {
    items: [activity("ev-z", 1, { type: "assistant.message", role: "assistant", text: "第二次重建", turnId: "tn-z" })],
  });
  await emit(request, { id: "reset-2", data: { type: "reset" } });
  await expect(page.getByText("第二次重建")).toBeVisible();
  await expect(page.getByText("重建后的回答")).toHaveCount(0);
  expect((await log(request)).activity).toBeGreaterThan(fetchesMid);

  // R6: the stream keeps working after the rebuild, without duplicates.
  const next = { id: "ev-y", data: activity("ev-y", 2, { type: "assistant.message", role: "assistant", text: "重建之后的新消息", turnId: "tn-y" }) };
  await emit(request, [next, next]);
  await expect(page.getByText("重建之后的新消息")).toHaveCount(1);
  await expect(assistant(page)).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath("after-data-reset.png") });
});
