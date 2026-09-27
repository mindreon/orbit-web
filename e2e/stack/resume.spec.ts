/**
 * Resume and reset against the real orbit-control SSE (Last-Event-ID, reset envelope).
 *
 * Ways this can fail (each is asserted below):
 *   R1 the client does not reconnect after the network drops.
 *   R2 the reconnect carries no Last-Event-ID, or one that is not an event id of this room.
 *   R3 events that happened while offline are missing after reconnect, or show twice.
 *   R4 the conversation blanks out while offline.
 *   R5 control's `reset` (malformed cursor) is not followed by a full /activity refetch.
 *   R6 after the reset the conversation shows items twice, or the stream stops working.
 */
import type { Request } from "@playwright/test";
import { expect, test } from "../test";
import { CONTROL_URL, activity, assistantItems, metrics, networkOutage, newRoom, openRoom, postMessage, send, shot, userItems, verify } from "./helpers";

test("reconnects with Last-Event-ID and shows what happened offline exactly once", { tag: ["@acc-5", "@acc-11"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · 断线续传");
  const streams: { lastEventId: string | null; query: string | null }[] = [];
  page.on("request", (req: Request) => {
    if (!req.url().includes(`/v1/rooms/${roomId}/events`)) return;
    streams.push({ lastEventId: req.headers()["last-event-id"] ?? null, query: new URL(req.url()).searchParams.get("lastEventId") });
  });
  await openRoom(page, roomId);
  await send(page, "第一句");
  await expect(assistantItems(page).filter({ hasText: /^助手hello/ })).toHaveCount(1);
  const before = await activity(request, roomId);
  const lastBefore = Math.max(...before.map((event) => event.id ?? 0));

  // A 6 s outage: the SSE stream is cut and reconnects are refused; meanwhile another client runs a turn.
  let dropped = 0;
  await verify([11], "断网 6 秒（中继切断 SSE 并拒绝重连），期间另一个客户端发一句话", "显示「实时连接中断」，已有对话留在屏幕上，不闪回空白", async () => {
    dropped = await networkOutage(request, 6000);
    expect(dropped).toBeGreaterThan(0);
    await expect(page.getByRole("status").filter({ hasText: "实时连接中断" })).toBeVisible({ timeout: 5000 }); // R1
    await postMessage(request, roomId, "断线期间另一个客户端发的消息", CONTROL_URL);
    await expect(userItems(page).filter({ hasText: "第一句" })).toBeVisible(); // R4
    return `连接被切断；显示「实时连接中断」；「第一句」仍可见`;
  });
  await shot(page, "offline");

  await verify([11], "网络恢复后自动重连", "断线期间的消息和回复各出现一次，不重复、不丢", async () => {
    await expect(userItems(page).filter({ hasText: "断线期间另一个客户端发的消息" })).toHaveCount(1, { timeout: 20_000 }); // R3
    await expect(assistantItems(page).filter({ hasText: /^助手hello/ })).toHaveCount(2);
    await page.waitForTimeout(1000);
    await expect(userItems(page)).toHaveCount(2);
    await expect(assistantItems(page)).toHaveCount(2);
    return `用户消息 ${await userItems(page).count()} 条（含断线期间那条 1 次），助手回复 ${await assistantItems(page).count()} 条`;
  });

  let resumeId = 0;
  await verify([5], "看重连请求头", "重连带 Last-Event-ID，取值是断线前最后收到的事件的 SSE id:（本房间真实存在的事件 id）", async () => {
    const after = await activity(request, roomId);
    const reconnect = streams[streams.length - 1];
    expect(streams.length).toBeGreaterThanOrEqual(2);
    resumeId = Number(reconnect.lastEventId);
    expect(reconnect.lastEventId).toMatch(/^\d+$/); // R2
    expect(resumeId).toBeGreaterThanOrEqual(lastBefore);
    expect(after.some((event) => event.id === resumeId)).toBe(true);
    expect(reconnect.query).toBe(reconnect.lastEventId);
    return `首连不带 Last-Event-ID：${streams[0].lastEventId === null}；重连 Last-Event-ID 为数字、≥ 断线前最后的持久事件 id、且是本房间的事件 id；查询参数 lastEventId 与请求头一致`;
  });
  await metrics({ resume: { outageMs: 6000, droppedConnections: dropped, connections: streams.length, lastEventIdOnReconnect: resumeId, lastDurableIdBeforeOffline: lastBefore } });
  await shot(page, "after-reconnect");
});

test("control's reset for a bad cursor triggers a full refetch and the stream keeps working", { tag: ["@acc-5", "@acc-11"] }, async ({ page, request }) => {
  const roomId = await newRoom(request, "stack · reset");
  await postMessage(request, roomId, "重置之前的消息");
  const timeline: { kind: "events" | "activity"; at: number }[] = [];
  page.on("request", (req: Request) => {
    if (req.url().includes(`/v1/rooms/${roomId}/events`)) timeline.push({ kind: "events", at: Date.now() });
    if (req.url().includes(`/v1/rooms/${roomId}/activity`)) timeline.push({ kind: "activity", at: Date.now() });
  });
  let tampered = false;
  await page.route(`**/v1/rooms/${roomId}/events**`, async (route) => {
    if (tampered) return route.continue();
    tampered = true;
    const url = new URL(route.request().url());
    url.searchParams.set("lastEventId", "abc");
    await route.continue({ url: url.toString(), headers: { ...route.request().headers(), "last-event-id": "abc" } });
  });

  await openRoom(page, roomId);
  await verify([5], "首次连接的游标被改成 abc，orbit-control 回 reset", "收到 reset 后重新全量拉取 /activity，对话不重复", async () => {
    await expect.poll(() => {
      const firstStream = timeline.find((entry) => entry.kind === "events");
      return firstStream ? timeline.filter((entry) => entry.kind === "activity" && entry.at >= firstStream.at).length : 0;
    }).toBeGreaterThan(0); // R5
    await expect(userItems(page).filter({ hasText: "重置之前的消息" })).toHaveCount(1); // R6
    await expect(assistantItems(page)).toHaveCount(1);
    return `reset 之后有全量 /activity 请求；「重置之前的消息」${await userItems(page).filter({ hasText: "重置之前的消息" }).count()} 条，助手回复 ${await assistantItems(page).count()} 条`;
  });

  await send(page, "重置之后的消息");
  await verify([5, 11], "reset 之后再发一句", "流继续工作，新回复出现一次", async () => {
    await expect(assistantItems(page).filter({ hasText: /^助手hello/ })).toHaveCount(2);
    await expect(userItems(page)).toHaveCount(2);
    return `用户消息 ${await userItems(page).count()} 条，助手回复 ${await assistantItems(page).filter({ hasText: /^助手hello/ }).count()} 条`;
  });
  await metrics({ reset: { tamperedCursor: "abc", activityRequests: timeline.filter((entry) => entry.kind === "activity").length } });
  await shot(page, "after-reset");
});
