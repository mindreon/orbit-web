#!/usr/bin/env node
/**
 * Test-only stand-in for orbit-control. It serves the room endpoints orbit-web reads and lets a test
 * script drive the SSE stream through /__test/*: emit frames, drop the connection, swap /activity.
 * It follows the contract the web codes against (C33): every SSE frame carries `id:` = the per-task event sequence,
 * which is also `sequence` on /activity items; assistant.delta keeps its own `seq` (chunk index within the block).
 * `event: reset` means refetch.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { perfDataset } from "./fixtures/datasets.mjs";

const PORT = Number(process.env.FAKE_CONTROL_PORT ?? 18080);
/** When set (e.g. "dist"), the built app is served from the same origin, so no proxy is involved. */
const STATIC_DIR = process.env.STATIC_DIR ?? "";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png" };

const ROOM = {
  id: "room-e2e",
  kind: "solo",
  title: "流式对话验收",
  state: "running",
  permissionPreset: "workspace-write",
  createdAt: "2026-09-26T08:00:00Z",
};

const state = {
  /** Last per-task event sequence handed out as an SSE id. */
  sequence: 0,
  activity: process.env.FIXTURE_MESSAGES
    ? perfDataset({ messages: Number(process.env.FIXTURE_MESSAGES), replyChars: Number(process.env.FIXTURE_REPLY_CHARS ?? 0) })
    : [],
  approvals: [],
  streams: new Set(),
  log: { events: [], activity: 0, posts: [], decisions: [] },
};

function maxSequence(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.sequence) || 0), 0);
}
state.sequence = maxSequence(state.activity);

/** Frames without an explicit id get the next per-task sequence; persisted events without one get it as `sequence`. */
function numbered(item) {
  const id = item.id ?? (item.noId ? undefined : String(++state.sequence));
  if (id && /^\d+$/.test(id)) state.sequence = Math.max(state.sequence, Number(id));
  let data = item.data;
  if (id && /^\d+$/.test(id) && data && typeof data === "object" && data.type && data.type !== "assistant.delta" && !data.sequence) {
    data = { ...data, sequence: Number(id) };
  }
  return { id, event: item.event, data };
}

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
  if (path === "/v1/approvals") return json(res, 200, { items: state.approvals });
  const decide = path.match(/^\/v1\/approvals\/([^/]+)\/decide$/);
  if (decide && req.method === "POST") {
    const { decision } = await readBody(req);
    const approval = state.approvals.find((item) => item.id === decide[1]);
    if (!approval) return json(res, 404, { code: "NOT_FOUND", message: "approval not found" });
    approval.status = "decided";
    approval.decision = decision;
    state.log.decisions.push({ id: approval.id, decision });
    return json(res, 200, approval);
  }

  if (path === `/v1/rooms/${ROOM.id}/activity`) {
    state.log.activity += 1;
    return json(res, 200, { items: state.activity });
  }

  if (path === `/v1/rooms/${ROOM.id}/abort` && req.method === "POST") return json(res, 200, { aborted: true });

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
    state.sequence = Math.max(state.sequence, maxSequence(state.activity));
    return json(res, 200, { ok: true, sequence: state.sequence });
  }
  if (path === "/__test/dataset" && req.method === "POST") {
    const { messages, replyChars } = await readBody(req);
    state.activity = perfDataset({ messages, replyChars });
    state.sequence = maxSequence(state.activity);
    return json(res, 200, { items: state.activity.length });
  }
  if (path === "/__test/approvals" && req.method === "POST") {
    state.approvals = (await readBody(req)).items ?? [];
    return json(res, 200, { ok: true });
  }
  if (path === "/__test/emit" && req.method === "POST") {
    const body = await readBody(req);
    const frames = (Array.isArray(body) ? body : [body]).map(numbered);
    for (const stream of state.streams) for (const item of frames) stream.write(frame(item));
    return json(res, 200, { delivered: state.streams.size, ids: frames.map((item) => item.id) });
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
    state.approvals = [];
    state.sequence = 0;
    state.log = { events: [], activity: 0, posts: [], decisions: [] };
    return json(res, 200, { ok: true });
  }

  if (STATIC_DIR && req.method === "GET" && !path.startsWith("/v1/") && !path.startsWith("/__test/")) {
    const file = normalize(join(STATIC_DIR, path)).startsWith(normalize(STATIC_DIR)) ? join(STATIC_DIR, path) : "";
    const target = file && extname(file) ? file : join(STATIC_DIR, "index.html");
    try {
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
      return res.end(body);
    } catch {
      // fall through to 404
    }
  }

  json(res, 404, { code: "NOT_FOUND", message: `${req.method} ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake orbit-control on http://127.0.0.1:${PORT}${STATIC_DIR ? ` (serving ${STATIC_DIR}; open /task/${ROOM.id})` : ""}`);
});
