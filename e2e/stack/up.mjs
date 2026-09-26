#!/usr/bin/env node
/**
 * Brings up the real Orbit stack for the acceptance E2E, in mock model mode, and keeps it running until killed:
 *   Temporal dev server → orbit-control (public + internal listener) → orbit-orch + orbit-worker (ORBIT_MODEL_MODE=mock)
 *   → orbit-web production build served by `vite preview`, proxying /v1 to control through a TCP relay.
 * The relay exists for the resume tests only: POST http://127.0.0.1:<admin>/drop?holdMs=N cuts every live connection
 * (the browser's SSE stream included) and refuses new ones for N ms, like a network outage. Control is untouched.
 * Checkouts, the control binary and the Temporal CLI live in .stack/ and are reused across runs.
 * Refs are pinned below; ORBIT_CONTROL_DIR / ORBIT_RUNTIME_DIR point at existing checkouts instead.
 */
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { join, resolve } from "node:path";

// orbit-control PR #15 head: A1 event passthrough, SSE `id:` + Last-Event-ID resume, internal listener. Move to main once merged.
const CONTROL_REF = process.env.ORBIT_CONTROL_REF ?? "4f483def1135f4b952a43b42ba96c5125abb1594";
// orbit-runtime with A1 events (#4) and the streaming mock model; the same commit control's real-stack sign-off uses.
const RUNTIME_REF = process.env.ORBIT_RUNTIME_REF ?? "72372183cf6cf7562738e622835e26f6a11f0e71";
const TEMPORAL_CLI = "1.9.1";

export const PORTS = { temporal: 17233, control: 18180, internal: 18181, relay: 18182, relayAdmin: 18183, orch: 18190, worker: 18191, web: 3410 };
const TOKEN = "e2e-orbit-web-internal-token";
const QUEUE = "orbit-web-e2e";

const ROOT = resolve(process.env.ORBIT_STACK_DIR ?? ".stack");
const BIN = join(ROOT, "bin");
const LOGS = join(ROOT, "logs");
const controlDir = process.env.ORBIT_CONTROL_DIR ?? join(ROOT, "orbit-control");
const runtimeDir = process.env.ORBIT_RUNTIME_DIR ?? join(ROOT, "orbit-runtime");
mkdirSync(BIN, { recursive: true });
mkdirSync(LOGS, { recursive: true });

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
const out = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

function checkout(repo, dir, ref) {
  if (!existsSync(dir)) run("git", ["clone", "-q", `https://github.com/mindreon/${repo}`, dir]);
  if (out("git", ["rev-parse", "HEAD"], dir) !== ref) {
    run("git", ["fetch", "-q", "origin", ref], dir);
    run("git", ["checkout", "-q", ref], dir);
  }
}

function prepare() {
  checkout("orbit-control", controlDir, CONTROL_REF);
  checkout("orbit-runtime", runtimeDir, RUNTIME_REF);
  console.log("[stack] building orbit-control");
  run("go", ["build", "-o", join(BIN, "orbit-control"), "./cmd/orbit-control"], controlDir);
  if (!existsSync(join(runtimeDir, ".venv", "bin", "orbit-worker"))) {
    console.log("[stack] installing orbit-runtime");
    run("sh", ["-c", "cat uv.lock.parts/part-* > uv.lock && sha256sum -c uv.lock.parts/SHA256SUMS"], runtimeDir);
    run("uv", ["sync", "--frozen", "--no-dev", "--python", "3.11"], runtimeDir);
  }
  if (!existsSync(join(BIN, "temporal"))) {
    console.log(`[stack] downloading Temporal CLI ${TEMPORAL_CLI}`);
    const url = `https://github.com/temporalio/cli/releases/download/v${TEMPORAL_CLI}/temporal_cli_${TEMPORAL_CLI}_linux_amd64.tar.gz`;
    run("sh", ["-c", `curl -sSfL "${url}" | tar -xz -C "${BIN}" temporal`]);
  }
}

const children = [];
function start(name, cmd, args, { cwd, env } = {}) {
  const log = createWriteStream(join(LOGS, `${name}.log`));
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[stack] ${name} exited with ${code}; see ${join(LOGS, `${name}.log`)}`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

async function waitHttp(url, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${url}`);
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

prepare();
if (process.env.STACK_SKIP_WEB_BUILD !== "1") {
  console.log("[stack] building orbit-web");
  run("pnpm", ["exec", "vite", "build"], process.cwd());
}

start("temporal", join(BIN, "temporal"), [
  "server", "start-dev", "--headless", "--ip", "127.0.0.1", "--port", String(PORTS.temporal), "--log-level", "warn",
  "--db-filename", join(ROOT, `temporal-${Date.now()}.db`),
]);
await new Promise((r) => setTimeout(r, 2500));

const temporal = { TEMPORAL_ADDRESS: `127.0.0.1:${PORTS.temporal}`, TEMPORAL_NAMESPACE: "default", TEMPORAL_TASK_QUEUE: QUEUE };
start("orbit-control", join(BIN, "orbit-control"), [], {
  env: {
    ...temporal,
    PORT: String(PORTS.control),
    ORBIT_INTERNAL_ADDR: `127.0.0.1:${PORTS.internal}`,
    ORBIT_INTERNAL_TOKEN: TOKEN,
    ORBIT_DATA_DIR: join(ROOT, `control-data-${Date.now()}`),
  },
});
await waitHttp(`http://127.0.0.1:${PORTS.control}/health`, 60);

const runtimeEnv = {
  ...temporal,
  ORBIT_MODEL_MODE: "mock",
  ORBIT_EVENT_INGEST_URL: `http://127.0.0.1:${PORTS.internal}/internal/events`,
  ORBIT_INTERNAL_TOKEN: TOKEN,
  ORBIT_WORKER_BIND: "127.0.0.1",
};
const venv = join(runtimeDir, ".venv", "bin");
start("orbit-orch", join(venv, "orbit-orch"), [], { cwd: runtimeDir, env: { ...runtimeEnv, ORBIT_WORKER_PORT: String(PORTS.orch) } });
start("orbit-worker", join(venv, "orbit-worker"), [], { cwd: runtimeDir, env: { ...runtimeEnv, ORBIT_WORKER_PORT: String(PORTS.worker) } });
await waitHttp(`http://127.0.0.1:${PORTS.worker}/`, 60);

// Network-outage relay between orbit-web's proxy and control (see header).
const sockets = new Set();
let refuseUntil = 0;
createTcpServer((client) => {
  if (Date.now() < refuseUntil) {
    client.destroy();
    return;
  }
  const upstream = connect(PORTS.control, "127.0.0.1");
  const pair = { client, upstream };
  sockets.add(pair);
  const close = () => {
    sockets.delete(pair);
    client.destroy();
    upstream.destroy();
  };
  client.on("error", close).on("close", close);
  upstream.on("error", close).on("close", close);
  client.pipe(upstream).pipe(client);
}).listen(PORTS.relay, "127.0.0.1");
createHttpServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://relay");
  if (req.method === "POST" && url.pathname === "/drop") {
    refuseUntil = Date.now() + Number(url.searchParams.get("holdMs") ?? 0);
    const dropped = sockets.size;
    for (const { client, upstream } of sockets) {
      client.destroy();
      upstream.destroy();
    }
    sockets.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ dropped }));
    return;
  }
  res.writeHead(404).end();
}).listen(PORTS.relayAdmin, "127.0.0.1");

start("orbit-web", "pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(PORTS.web), "--strictPort"], {
  env: { ORBIT_CONTROL_URL: `http://127.0.0.1:${PORTS.relay}` },
});
await waitHttp(`http://127.0.0.1:${PORTS.web}/`, 60);

const python = join(venv, "python");
const components = {
  modelMode: "mock",
  orbitControl: { repo: "mindreon/orbit-control", ref: CONTROL_REF },
  orbitRuntime: { repo: "mindreon/orbit-runtime", ref: RUNTIME_REF },
  orbitWeb: { ref: out("git", ["rev-parse", "HEAD"], process.cwd()) },
  temporalCli: TEMPORAL_CLI,
  go: out("go", ["env", "GOVERSION"]),
  python: out(python, ["-c", "import platform; print(platform.python_version())"]),
  agentscope: out(python, ["-c", "import importlib.metadata as m; print(m.version('agentscope'))"]),
};
writeFileSync(join(ROOT, "stack.json"), `${JSON.stringify(components, null, 2)}\n`);
console.log(`[stack] up: web http://127.0.0.1:${PORTS.web}  control http://127.0.0.1:${PORTS.control}  (mock model)`);
