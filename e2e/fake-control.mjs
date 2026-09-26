#!/usr/bin/env node
/**
 * Test-only stand-in for orbit-control. It serves the room endpoints orbit-web reads and lets a test
 * script drive the SSE stream through /__test/*: emit frames, drop the connection, swap /activity.
 * It follows the contract the web codes against: every SSE frame carries `id:`, `event: reset` means refetch.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_CONTROL_PORT ?? 18080);

const ROOM = {
  id: "room-e2e",
  kind: "solo",
  title: "流式对话验收",
  state: "running",
  permissionPreset: "workspace-write",
  createdAt: "2026-09-26T08:00:00Z",
};

const state = {
  activity: [],
  streams: new Set(),
  log: { events: [], activity: 0, posts: [] },
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function frame({ id, event, data }) {
  let out = "";
  if (id) out += `id: ${id}\n`;
  if (event) out += `event: ${event}\n`;
  if (data !== undefined) {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    for (const line of text.split("\n")) out += `data: ${line}\n`;
  }
  return `${out}\n`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === "/health") return json(res, 200, { status: "ok" });
  if (path === "/v1/rooms" && req.method === "GET") return json(res, 200, { items: [ROOM] });
  if (path === `/v1/rooms/${ROOM.id}` && req.method === "GET") return json(res, 200, ROOM);
  if (path === "/v1/approvals") return json(res, 200, { items: [] });

  if (path === `/v1/rooms/${ROOM.id}/activity`) {
    state.log.activity += 1;
    return json(res, 200, { items: state.activity });
  }

  if (path === `/v1/rooms/${ROOM.id}/messages` && req.method === "POST") {
    state.log.posts.push(await readBody(req));
    return json(res, 200, { room: ROOM, approval: null });
  }

  if (path === `/v1/rooms/${ROOM.id}/events`) {
    state.log.events.push({
      lastEventIdHeader: req.headers["last-event-id"] ?? null,
      lastEventIdQuery: url.searchParams.get("lastEventId"),
    });
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    state.streams.add(res);
    req.on("close", () => state.streams.delete(res));
    return;
  }

  if (path === "/__test/activity" && req.method === "POST") {
    state.activity = (await readBody(req)).items ?? [];
    return json(res, 200, { ok: true });
  }
  if (path === "/__test/emit" && req.method === "POST") {
    const body = await readBody(req);
    const frames = Array.isArray(body) ? body : [body];
    for (const stream of state.streams) for (const item of frames) stream.write(frame(item));
    return json(res, 200, { delivered: state.streams.size });
  }
  if (path === "/__test/drop" && req.method === "POST") {
    for (const stream of state.streams) stream.destroy();
    state.streams.clear();
    return json(res, 200, { ok: true });
  }
  if (path === "/__test/log") return json(res, 200, { ...state.log, open: state.streams.size });
  if (path === "/__test/clear" && req.method === "POST") {
    for (const stream of state.streams) stream.destroy();
    state.streams.clear();
    state.activity = [];
    state.log = { events: [], activity: 0, posts: [] };
    return json(res, 200, { ok: true });
  }

  json(res, 404, { code: "NOT_FOUND", message: `${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake orbit-control on http://127.0.0.1:${PORT}`);
});
