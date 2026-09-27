#!/usr/bin/env node
/**
 * Test-only stand-in for orbit-control. It serves the room endpoints orbit-web reads and lets a test
 * script drive the SSE stream through /__test/*: emit frames, drop the connection, swap /activity.
 * It speaks control's event contract (orbit-control docs/contract-notes/sse-resume.md, C33):
 * - /activity items and every SSE `data:` are envelopes `{id, type, taskId, ts, source, payload}`; `id` is the event id
 *   and the SSE `id:`. Tests hand in flat events; `sequence` becomes the envelope id and the rest the payload.
 * - assistant.delta and reset envelopes have no `id`; their SSE `id:` repeats the room's last durable event id.
 * - assistant.delta keeps its own `seq` (chunk index within the block).
 * - reset is `{type: "reset", payload: {reason, lastId}}`; a legacy `event: reset` frame is still accepted by the web.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { perfDataset } from "./fixtures/datasets.mjs";

const PORT = Number(process.env.FAKE_CONTROL_PORT ?? 18080);
/** When set (e.g. "dist"), the built app is served from the same origin, so no proxy is involved. */
const STATIC_DIR = process.env.STATIC_DIR ?? "";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png" };

const MCP_MARKET = [
  {
    id: "modelcontextprotocol-fetch",
    name: "Fetch网页内容抓取",
    summary: "检索并整理网页内容",
    author: "@modelcontextprotocol",
    category: "browser-automation",
    categoryName: "浏览器自动化",
    categoryMore: 0,
    calls: 322054194,
    views: 617691,
    stars: 1046,
    verified: true,
    hosted: true,
    needsOnline: true,
  },
  {
    id: "modelcontextprotocol-filesystem",
    name: "文件系统",
    summary: "读写本机文件",
    author: "@modelcontextprotocol",
    category: "file-systems",
    categoryName: "文件系统",
    categoryMore: 0,
    calls: 0,
    views: 73400,
    stars: 182,
    verified: true,
    hosted: false,
    needsOnline: false,
  },
];

const MCP_DETAILS = {
  "modelcontextprotocol-fetch": {
    license: "MIT License",
    updatedOn: "2026.09.27",
    readme: "该服务器使大型语言模型能够检索和处理网页内容，将 HTML 转为 markdown。",
    tools: [
      {
        name: "fetch",
        description: "抓取网页并转为 markdown",
        params: [{ name: "url", type: "string", required: true, description: "要抓取的地址" }],
      },
    ],
  },
  "modelcontextprotocol-filesystem": {
    license: "MIT License",
    updatedOn: "2026.09.20",
    readme: "读写本机目录里的文件。",
    tools: [
      {
        name: "read_file",
        description: "读取一个文件",
        params: [{ name: "path", type: "string", required: true, description: "文件路径" }],
      },
    ],
  },
};

const MCP_CATEGORIES = [
  { key: "browser-automation", name: "浏览器自动化", sortOrder: 1 },
  { key: "file-systems", name: "文件系统", sortOrder: 6 },
];

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
  personas: [],
  connectors: [],
  skills: [
    {
      id: "demo/weekly",
      slug: "weekly",
      handle: "demo",
      name: "周报汇总",
      description: "把一周的进展收成一篇周报",
      category: "office-efficiency",
      categoryName: "办公效率",
      iconUrl: "",
      downloads: 12000,
      stars: 80,
      source: "community",
      version: "1.0.0",
      requiresApiKey: false,
      paid: false,
      score: 90,
      updatedAt: "2026-09-01T00:00:00Z",
      trendingRank: 1,
    },
    {
      id: "demo/code",
      slug: "code",
      handle: "demo",
      name: "代码审查",
      description: "检查改动里的明显问题",
      category: "dev-programming",
      categoryName: "开发编程",
      iconUrl: "",
      downloads: 3000,
      stars: 10,
      source: "clawhub",
      version: "0.2.0",
      requiresApiKey: false,
      paid: false,
      score: 40,
      updatedAt: "2026-08-01T00:00:00Z",
      trendingRank: 0,
    },
    {
      id: "notes",
      slug: "notes",
      handle: "",
      name: "随手笔记",
      description: "没有作者名的技能",
      category: "office-efficiency",
      categoryName: "办公效率",
      iconUrl: "",
      downloads: 100,
      stars: 2,
      source: "community",
      version: "0.1.0",
      requiresApiKey: false,
      paid: false,
      score: 10,
      updatedAt: "2026-06-01T00:00:00Z",
      trendingRank: 0,
    },
    {
      id: "demo/meeting",
      slug: "meeting",
      handle: "demo",
      name: "会议纪要",
      description: "把会议记录收成纪要",
      category: "office-efficiency",
      categoryName: "办公效率",
      iconUrl: "",
      downloads: 800,
      stars: 4,
      source: "community",
      version: "0.1.0",
      requiresApiKey: false,
      paid: false,
      score: 20,
      updatedAt: "2026-07-01T00:00:00Z",
      trendingRank: 0,
    },
  ],
  skillFiles: {
    "demo/weekly": [{ path: "SKILL.md", body: "# 周报怎么写\n\n周报技能说明正文\n\n- 本周进展\n- 下周计划\n" }],
    notes: [{ path: "SKILL.md", body: "没有作者的技能说明" }],
  },
  skillMeta: {
    "demo/weekly": {
      summaryZh: "把一周进展收成周报",
      subCategories: [{ key: "office-writing", name: "办公写作" }],
      safe: true,
      score: 4.7,
      version: "0.1.0",
      updatedAt: Date.parse("2026-06-01T00:00:00Z"),
      versionCreatedAt: Date.parse("2026-06-01T00:00:00Z"),
      fileIndex: [{ path: "SKILL.md", size: 24 }],
      versions: [{ version: "0.1.0", changelog: "第一版", createdAt: Date.parse("2026-06-01T00:00:00Z") }],
      evaluation: {
        userSummary: "周报技能评测摘要",
        createdAt: Date.parse("2026-06-01T00:00:00Z"),
        score: 4.7,
        dimensions: [{ key: "T", label: "Trust", labelZh: "可信任度", score: 4.7, summary: "安全" }],
      },
    },
  },
  skillCategories: [
    { key: "office-efficiency", name: "办公效率", nameEn: "Office", sortOrder: 10 },
    { key: "dev-programming", name: "开发编程", nameEn: "Development", sortOrder: 30 },
  ],
  /** Fault knobs for the state tests: an HTTP status for /activity, and a delay before it answers. */
  faults: { activityStatus: 0, activityDelayMs: 0 },
  streams: new Set(),
  log: { events: [], activity: 0, posts: [], decisions: [] },
};

function maxSequence(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.sequence) || 0), 0);
}
state.sequence = maxSequence(state.activity);

const LIVE_ONLY = new Set(["assistant.delta", "reset"]);

/** Wraps a flat test event in control's envelope. `id` is omitted for live-only types. */
function envelope(event, id) {
  const { id: _eventId, sequence: _sequence, source = "worker", ...payload } = event;
  const out = { type: event.type, taskId: ROOM.id, ts: event.occurredAt || new Date().toISOString(), source, payload };
  return LIVE_ONLY.has(event.type) ? out : { id, ...out };
}

/**
 * Durable frames get the next event id (unless the test pins one); live-only frames repeat the last durable id.
 * Non-object data (e.g. raw strings) and legacy named events pass through unchanged.
 */
function numbered(item) {
  const data = item.data;
  const isEvent = data && typeof data === "object" && typeof data.type === "string";
  const liveOnly = isEvent && LIVE_ONLY.has(data.type);
  let id = item.id;
  if (id === undefined && !item.noId) id = liveOnly || item.event ? String(state.sequence) : String(++state.sequence);
  if (id && /^\d+$/.test(id) && !liveOnly) state.sequence = Math.max(state.sequence, Number(id));
  if (!isEvent) return { id, event: item.event, data };
  if (data.type === "reset") return { id, data: { type: "reset", taskId: ROOM.id, ts: new Date().toISOString(), source: "control", payload: { reason: "unknown", lastId: Number(id) || 0 } } };
  return { id, data: envelope(data, Number(data.sequence) || Number(id)) };
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
  if (path === "/v1/personas" && req.method === "GET") return json(res, 200, { items: state.personas });
  if (path === "/v1/personas" && req.method === "POST") {
    const body = await readBody(req);
    const name = String(body.name ?? "").trim();
    if (!name) return json(res, 400, { code: "BAD_REQUEST", message: "the request is invalid" });
    const persona = {
      id: `persona-${state.personas.length + 1}`,
      name,
      instructions: String(body.instructions ?? ""),
      createdAt: "2026-09-27T00:00:00Z",
    };
    state.personas.unshift(persona);
    return json(res, 200, persona);
  }
  if (path === "/v1/skill-categories" && req.method === "GET") return json(res, 200, { items: state.skillCategories });
  if (path === "/v1/skills" && req.method === "GET") {
    const sortBy = url.searchParams.get("sortBy") || "score";
    const category = url.searchParams.get("category") || "";
    const source = url.searchParams.get("source") || "";
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize") || 24)));
    const matched = state.skills.filter((skill) => {
      if (category && skill.category !== category) return false;
      if (source && skill.source !== source) return false;
      if (keyword && !skill.name.includes(keyword) && !skill.description.includes(keyword)) return false;
      if (sortBy === "trending" && !skill.trendingRank) return false;
      return true;
    });
    const start = (page - 1) * pageSize;
    return json(res, 200, {
      items: matched.slice(start, start + pageSize),
      total: matched.length,
      page,
      pageSize,
      syncedAt: "2026-09-27T00:00:00Z",
    });
  }
  const skillDetail = path.match(/^\/v1\/skills\/([^/]+)\/([^/]+)$/);
  if (skillDetail && req.method === "GET") {
    const id = `${decodeURIComponent(skillDetail[1])}/${decodeURIComponent(skillDetail[2])}`;
    const skill = state.skills.find((item) => item.id === id);
    if (!skill) return json(res, 404, { code: "NOT_FOUND", message: "skill not found" });
    return json(res, 200, skill);
  }
  const skillOne = path.match(/^\/v1\/skills\/([^/]+)$/);
  if (skillOne && req.method === "GET") {
    const id = decodeURIComponent(skillOne[1]);
    const skill = state.skills.find((item) => item.id === id);
    if (!skill) return json(res, 404, { code: "NOT_FOUND", message: "skill not found" });
    return json(res, 200, skill);
  }
  const skillFiles = path.match(/^\/v1\/skill-files\/(.+)$/);
  if (skillFiles && req.method === "GET") {
    const id = decodeURIComponent(skillFiles[1]);
    const skill = state.skills.find((item) => item.id === id);
    if (!skill) return json(res, 404, { code: "NOT_FOUND", message: "skill not found" });
    const meta = state.skillMeta[id];
    return json(res, 200, { items: state.skillFiles[id] ?? [], ...(meta ? { meta } : {}) });
  }
  const marketOne = path.match(/^\/v1\/mcp-market\/([^/]+)$/);
  if (marketOne && req.method === "GET") {
    const id = decodeURIComponent(marketOne[1]);
    const item = MCP_MARKET.find((row) => row.id === id);
    if (!item) return json(res, 404, { code: "NOT_FOUND", message: "market server not found" });
    return json(res, 200, { ...item, ...(MCP_DETAILS[id] ?? { license: "", updatedOn: "", readme: "", tools: [] }) });
  }
  if (path === "/v1/mcp-market-categories" && req.method === "GET") {
    const needsOnline = url.searchParams.get("needsOnline") || "";
    const counts = new Map();
    for (const item of MCP_MARKET) {
      if (needsOnline === "true" && !item.needsOnline) continue;
      if (needsOnline === "false" && item.needsOnline) continue;
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    const items = MCP_CATEGORIES.filter((item) => counts.get(item.key)).map((item) => ({ ...item, count: counts.get(item.key) }));
    return json(res, 200, { items });
  }
  if (path === "/v1/mcp-market" && req.method === "GET") {
    const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
    const category = url.searchParams.get("category") || "";
    const serviceType = url.searchParams.get("serviceType") || "";
    const needsOnline = url.searchParams.get("needsOnline") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize") || 30)));
    const stored = MCP_MARKET.filter((item) => {
      if (needsOnline === "true" && !item.needsOnline) return false;
      if (needsOnline === "false" && item.needsOnline) return false;
      return true;
    });
    const matched = stored.filter((item) => {
      if (category && item.category !== category) return false;
      if (serviceType === "hosted" && !item.hosted) return false;
      if (serviceType === "local" && item.hosted) return false;
      if (!keyword) return true;
      const blob = `${item.name} ${item.author} ${item.summary} ${item.category} ${item.categoryName}`.toLowerCase();
      return blob.includes(keyword);
    });
    const start = (page - 1) * pageSize;
    return json(res, 200, {
      items: matched.slice(start, start + pageSize),
      total: matched.length,
      stored: stored.length,
      plazaTotal: 12525,
      page,
      pageSize,
    });
  }
  if (path === "/v1/mcp-connectors" && req.method === "GET") return json(res, 200, { items: state.connectors });
  if (path === "/v1/mcp-connectors" && req.method === "POST") {
    const body = await readBody(req);
    const name = String(body.name ?? "").trim();
    const transport = String(body.transport ?? "stdio");
    const command = String(body.command ?? "").trim();
    const url = String(body.url ?? "").trim();
    const envRefs = Array.isArray(body.envRefs) ? body.envRefs.map(String) : [];
    const headerRefs = Array.isArray(body.headerRefs) ? body.headerRefs : [];
    const headerBad = headerRefs.some((item) => {
      const env = String(item?.env ?? "");
      const header = String(item?.name ?? "");
      return !header || !env || env.includes("=") || env.includes(" ") || header.includes("=");
    });
    const missingTarget = transport === "streamable_http" ? !url : !command;
    if (!name || missingTarget || headerBad || envRefs.some((item) => item.includes("="))) {
      return json(res, 400, { code: "BAD_REQUEST", message: "the request is invalid" });
    }
    const connector = {
      id: `mcp-${state.connectors.length + 1}`,
      name,
      transport,
      command: transport === "streamable_http" ? "" : command,
      args: Array.isArray(body.args) ? body.args.map(String) : [],
      envRefs,
      url: transport === "streamable_http" ? url : "",
      headerRefs,
      defaultOpen: body.defaultOpen === true,
      createdAt: "2026-09-27T00:00:00Z",
    };
    state.connectors.unshift(connector);
    return json(res, 200, connector);
  }
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
    if (state.faults.activityDelayMs) await new Promise((resolve) => setTimeout(resolve, state.faults.activityDelayMs));
    if (state.faults.activityStatus) return json(res, state.faults.activityStatus, { code: "INTERNAL", message: "activity unavailable" });
    return json(res, 200, { items: state.activity.map((event) => envelope(event, Number(event.sequence))) });
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
  if (path === "/__test/faults" && req.method === "POST") {
    state.faults = { activityStatus: 0, activityDelayMs: 0, ...(await readBody(req)) };
    return json(res, 200, state.faults);
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
    state.personas = [];
    state.connectors = [];
    state.faults = { activityStatus: 0, activityDelayMs: 0 };
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
