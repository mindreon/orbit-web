#!/usr/bin/env node
/**
 * Brings up the real Orbit stack for the acceptance E2E, in mock model mode, and keeps it running until killed:
 *   Temporal dev server → orbit-control (public + internal listener) → orbit-orch + orbit-worker (ORBIT_MODEL_MODE=mock)
 *   → orbit-web production build served by `vite preview`, proxying /v1 to control through a TCP relay.
 * The relay exists for the resume tests only: POST http://127.0.0.1:<admin>/drop?holdMs=N cuts every live connection
 * (the browser's SSE stream included) and refuses new ones for N ms, like a network outage. Control is untouched.
 * The control binary and the Temporal CLI live in .stack/ and are reused across runs.
 * By default ORBIT_CONTROL_DIR / ORBIT_RUNTIME_DIR point at this workspace's
 * submodules; CI may provide immutable refs or alternate checkouts.
 */
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { join, resolve } from "node:path";

// The acceptance stack must exercise the current submodules by default. CI can
// pin immutable commits with ORBIT_CONTROL_REF / ORBIT_RUNTIME_REF.
const CONTROL_REF = process.env.ORBIT_CONTROL_REF ?? "working-tree";
const RUNTIME_REF = process.env.ORBIT_RUNTIME_REF ?? "working-tree";
const TEMPORAL_CLI = process.env.TEMPORAL_CLI_VERSION ?? "1.9.1";

export const PORTS = { minio: 19000, postgres: 55440, temporal: 17233, control: 18180, internal: 18181, relay: 18182, relayAdmin: 18183, orch: 18190, worker: 18191, web: 3410 };
const TOKEN = "e2e-orbit-web-internal-token";
const QUEUE = "orbit.orch";

const INFRA_ROOT = resolve(process.env.ORBIT_INFRA_DIR ?? join(process.cwd(), ".."));
const ROOT = resolve(process.env.ORBIT_STACK_DIR ?? join(INFRA_ROOT, ".stack"));
const BIN = join(ROOT, "bin");
const LOGS = join(ROOT, "logs");
const controlDir = process.env.ORBIT_CONTROL_DIR ?? join(INFRA_ROOT, "orbit-control");
const runtimeDir = process.env.ORBIT_RUNTIME_DIR ?? join(INFRA_ROOT, "orbit-runtime");
mkdirSync(BIN, { recursive: true });
mkdirSync(LOGS, { recursive: true });

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
const out = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

function checkout(repo, dir, ref) {
	if (ref === "working-tree") {
		if (!existsSync(join(dir, ".git"))) throw new Error(`${repo} working-tree checkout is missing: ${dir}`);
		return;
	}
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
  const localTemporal = process.env.TEMPORAL_CLI_BIN ?? (process.platform === "darwin" || process.platform === "linux" ? out("sh", ["-c", "command -v temporal || true"], process.cwd()) : "");
  if (localTemporal) {
    if (!existsSync(join(BIN, "temporal"))) run("cp", [localTemporal, join(BIN, "temporal")], process.cwd());
  } else if (!existsSync(join(BIN, "temporal"))) {
    console.log(`[stack] downloading Temporal CLI ${TEMPORAL_CLI}`);
    const platform = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    const url = `https://github.com/temporalio/cli/releases/download/v${TEMPORAL_CLI}/temporal_cli_${TEMPORAL_CLI}_${platform}_${arch}.tar.gz`;
    run("sh", ["-c", `curl -sSfL "${url}" | tar -xz -C "${BIN}" temporal`]);
  }
}

// Real PostgreSQL: orbit_control with the v3 task tables and the four roles, plus a scratch database for the
// worker's AgentState. Durable events only travel through runtime_outbox, and a durable store is what lets E2 and E6
// restart the worker.
const PG_CONTAINER = "orbit-stack-pg";
const MINIO = {
  container: "orbit-stack-minio",
  network: "orbit-stack-net",
  // Pinned like compose.yaml; MinIO no longer publishes community images, so this is Chainguard's build.
  image: "cgr.dev/chainguard/minio@sha256:6a1d0b45c8669726bba580ced0bfa4cb9fdeed1ed636dfabd81d1577beb6937b",
  client: "cgr.dev/chainguard/minio-client:latest-dev@sha256:fdb40d819ca51969c86fa76f45a67bb841759daf85d4c6ce9aa86d27f6e47ae9",
  bucket: "orbit",
  rootUser: "orbit-admin",
  rootPassword: "stack-minio-root",
  workerKey: "orbit-worker",
  workerSecret: "stack-minio-worker",
};
const PG_PASSWORDS = { owner: "stack-owner", app: "stack-app", ops: "stack-ops", worker: "stack-worker" };
const pgUrl = (role, database) => `postgres://${role}:${PG_PASSWORDS[role.replace("orbit_", "")]}@127.0.0.1:${PORTS.postgres}/${database}?sslmode=disable`;
const psql = (database, input, extra = []) =>
  execFileSync("docker", ["exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", ...extra, "-f", "-"], { input, stdio: ["pipe", "ignore", "inherit"] });

async function startMinio() {
  for (const name of [MINIO.container]) { try { execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); } catch { /* not running */ } }
  try { execFileSync("docker", ["network", "create", MINIO.network], { stdio: "ignore" }); } catch { /* exists */ }
  run("docker", ["run", "-d", "--name", MINIO.container, "--network", MINIO.network, "-p", `127.0.0.1:${PORTS.minio}:9000`,
    "-e", `MINIO_ROOT_USER=${MINIO.rootUser}`, "-e", `MINIO_ROOT_PASSWORD=${MINIO.rootPassword}`, MINIO.image, "server", "/data"]);
  await waitHttp(`http://127.0.0.1:${PORTS.minio}/minio/health/live`, 60);
  run("docker", ["run", "--rm", "--network", MINIO.network, "-v", `${join(process.cwd(), "e2e", "stack", "minio-init.sh")}:/init.sh:ro`,
    "-e", `MINIO_ENDPOINT=http://${MINIO.container}:9000`, "-e", `MINIO_ROOT_USER=${MINIO.rootUser}`, "-e", `MINIO_ROOT_PASSWORD=${MINIO.rootPassword}`,
    "-e", `BUCKET=${MINIO.bucket}`, "-e", `WORKER_KEY=${MINIO.workerKey}`, "-e", `WORKER_SECRET=${MINIO.workerSecret}`,
    "--entrypoint", "/bin/sh", MINIO.client, "/init.sh"]);
}

const objectStoreEnv = {
  ORBIT_OBJECT_STORE_ENDPOINT: `http://127.0.0.1:${PORTS.minio}`,
  ORBIT_OBJECT_STORE_BUCKET: MINIO.bucket,
  ORBIT_OBJECT_STORE_ACCESS_KEY: MINIO.workerKey,
  ORBIT_OBJECT_STORE_SECRET_KEY: MINIO.workerSecret,
};

async function startPostgres() {
  try { execFileSync("docker", ["rm", "-f", PG_CONTAINER], { stdio: "ignore" }); } catch { /* not running */ }
  run("docker", ["run", "-d", "--name", PG_CONTAINER, "-e", "POSTGRES_PASSWORD=stack", "-p", `127.0.0.1:${PORTS.postgres}:5432`, "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) {
    try { execFileSync("docker", ["exec", PG_CONTAINER, "pg_isready", "-U", "postgres", "-h", "127.0.0.1"], { stdio: "ignore" }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    if (i === 59) throw new Error("postgres did not become ready");
  }
  await new Promise((r) => setTimeout(r, 1000));
  psql("postgres", readFileSync(join(controlDir, "deploy", "postgres", "bootstrap-roles.sql")), Object.entries(PG_PASSWORDS).flatMap(([role, password]) => ["-v", `${role}_password=${password}`]));
  psql("postgres", "CREATE DATABASE orbit_state;");
}

const children = [];
function start(name, cmd, args, { cwd, env } = {}) {
  const log = createWriteStream(join(LOGS, `${name}.log`));
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    if (!shuttingDown && !child.expectedExit) {
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
  for (const name of [PG_CONTAINER, MINIO.container]) { try { execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); } catch { /* already gone */ } }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

prepare();
writeFileSync(join(ROOT, "tool-runs.log"), "");
console.log("[stack] starting postgres and minio");
await startPostgres();
await startMinio();
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
// Three control replicas (A30). The browser's proxy talks to replica 0; the worker posts its live events to replica 1,
// so for most tasks they arrive at a replica that does not own the task and have to be handed on. Membership is a
// file the replicas re-read every second, which is how the suite shrinks and grows the cluster.
const REPLICAS = [0, 1, 2].map((index) => ({
  index,
  port: PORTS.control + index * 100,
  internalPort: PORTS.internal + index * 100,
  url: `http://127.0.0.1:${PORTS.control + index * 100}`,
  internalUrl: `http://127.0.0.1:${PORTS.internal + index * 100}`,
}));
const MEMBERS_FILE = join(ROOT, "control-members");
const writeMembers = (active) => writeFileSync(MEMBERS_FILE, REPLICAS.filter((r) => active.has(r.index)).map((r) => r.url).join(","));
writeMembers(new Set(REPLICAS.map((r) => r.index)));

const controlEnvFor = (replica) => ({
  ...temporal,
  PORT: String(replica.port),
  ORBIT_INTERNAL_ADDR: `127.0.0.1:${replica.internalPort}`,
  ORBIT_INTERNAL_TOKEN: TOKEN,
  ORBIT_SKILLHUB_SYNC: "0",
  ORBIT_DATA_DIR: join(ROOT, `control-data-${Date.now()}-${replica.index}`),
  ...objectStoreEnv,
  ORBIT_CONTROL_DB_URL: pgUrl("orbit_app", "orbit_control"),
  ORBIT_CONTROL_MIGRATE_ON_START: "1",
  ORBIT_CONTROL_MIGRATE_DB_URL: pgUrl("orbit_owner", "orbit_control"),
  ORBIT_CONTROL_MEMBER_ID: replica.url,
  ORBIT_CONTROL_MEMBERS: REPLICAS.map((r) => r.url).join(","),
  ORBIT_CONTROL_INTERNAL_MEMBERS: REPLICAS.map((r) => r.internalUrl).join(","),
  ORBIT_CONTROL_MEMBERS_FILE: MEMBERS_FILE,
  ORBIT_CONTROL_MEMBERS_REFRESH_SECONDS: "1",
});

// Like compose: control migrates, then refuses to serve until the tenant row exists (ensure-tenant.sql).
const migrate = start("orbit-control-migrate", join(BIN, "orbit-control"), [], { env: controlEnvFor(REPLICAS[0]) });
migrate.expectedExit = true;
await new Promise((resolve) => migrate.on("exit", resolve));
psql("orbit_control", "INSERT INTO tenants (id, name) VALUES ('default', 'default') ON CONFLICT (id) DO NOTHING;");
const controls = new Map();
const running = new Set();
const startReplica = async (replica) => {
  controls.set(replica.index, start(`orbit-control-${replica.index}`, join(BIN, "orbit-control"), [], { env: controlEnvFor(replica) }));
  await waitHttp(`${replica.url}/health`, 60);
  running.add(replica.index);
};
await Promise.all(REPLICAS.map(startReplica));

// STACK_MODEL=real runs the worker against a real model: ORBIT_MODEL_* come from the infra .env (values are never
// printed). The mock-only knobs (delays, tool log, slow tools) are dropped, since a real model does not read them.
function realModelEnv() {
  const file = join(INFRA_ROOT, ".env");
  if (!existsSync(file)) throw new Error("STACK_MODEL=real needs ORBIT_MODEL_* in the infra .env");
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^(?:export\s+)?(ORBIT_MODEL_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  for (const key of ["ORBIT_MODEL_BASE_URL", "ORBIT_MODEL_API_KEY", "ORBIT_MODEL_NAME"]) {
    if (!values[key]) throw new Error(`${key} is not set in the infra .env`);
  }
  return { ...values, ORBIT_MODEL_MODE: "real" };
}
const REAL_MODEL = process.env.STACK_MODEL === "real";

const runtimeEnv = {
  ...temporal,
  ...(REAL_MODEL
    ? realModelEnv()
    : {
        ORBIT_MODEL_MODE: "mock",
        ORBIT_MOCK_TURN_DELAY_MS: "1500",
        ORBIT_MOCK_STREAM_DELAY_MS: "700",
        // slow_echo (mock only) holds a side-effecting call open and logs every real run, so A12/A27/A32 can be driven.
        ORBIT_MOCK_TOOL_DELAY_MS: "4000",
        ORBIT_MOCK_TOOL_LOG: join(ROOT, "tool-runs.log"),
        // Long enough that E6 can kill the worker inside step 2 however slow the machine is.
        ORBIT_MOCK_SOP_STEP_DELAY_MS: "4000",
      }),
  ORBIT_HEARTBEAT_THROTTLE_S: "1",
  ORBIT_EVENT_INGEST_URL: `${REPLICAS[1].internalUrl}/internal/events`,
  ORBIT_INTERNAL_TOKEN: TOKEN,
  ORBIT_WORKER_BIND: "127.0.0.1",
  // Worker Versioning (T2.6): every process belongs to the `orbit` deployment under a build id.
  ORBIT_USE_WORKER_VERSIONING: "1",
  ORBIT_WORKER_DEPLOYMENT: "orbit",
};
const venv = join(runtimeDir, ".venv", "bin");
const workerEnv = {
  ...runtimeEnv,
  ORBIT_WORKER_PORT: String(PORTS.worker),
  ORBIT_CHECKPOINT_DIR: join(ROOT, `checkpoints-${Date.now()}`),
  ...objectStoreEnv,
  ORBIT_STATE_STORE_URL: `postgres://postgres:stack@127.0.0.1:${PORTS.postgres}/orbit_state`,
  ORBIT_ALLOW_PLAINTEXT_STATE: "1",
  ORBIT_CONTROL_WORKER_DB_URL: pgUrl("orbit_worker", "orbit_control"),
};
// One release is an orbit-orch plus an orbit-worker under one build id. `v1` is the first and is made current at once.
const releases = new Map();
const tctl = (...args) => execFileSync(join(BIN, "temporal"), [...args, "--address", `127.0.0.1:${PORTS.temporal}`], { encoding: "utf8" });

async function startRelease(build, portOffset) {
  const versioned = { ORBIT_WORKER_BUILD_ID: build };
  const orch = start(`orbit-orch-${build}`, join(venv, "orbit-orch"), [], { cwd: runtimeDir, env: { ...runtimeEnv, ...versioned, ORBIT_WORKER_PORT: String(PORTS.orch + portOffset) } });
  const workerProcess = start(`orbit-worker-${build}`, join(venv, "orbit-worker"), [], { cwd: runtimeDir, env: { ...workerEnv, ...versioned, ORBIT_WORKER_PORT: String(PORTS.worker + portOffset) } });
  releases.set(build, { orch, worker: workerProcess, portOffset });
  await waitHttp(`http://127.0.0.1:${PORTS.worker + portOffset}/`, 60);
  return workerProcess;
}

/** Waits for the build to be known to Temporal (its workers polled), then makes it the deployment's current version. */
async function makeCurrent(build) {
  for (let i = 0; i < 120; i++) {
    try { tctl("worker", "deployment", "describe-version", "--deployment-name", "orbit", "--build-id", build); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    if (i === 119) throw new Error(`build ${build} never registered`);
  }
  tctl("worker", "deployment", "set-current-version", "--deployment-name", "orbit", "--build-id", build, "--ignore-missing-task-queues", "--yes");
}

let worker = await startRelease("v1", 0);
await makeCurrent("v1");

/** Starts release `build` next to the running ones and makes it current: new work moves, running attempts stay put. */
async function releaseBuild(build) {
  await startRelease(build, 10);
  await makeCurrent(build);
}

/** Back to v1 as current, and the given build retired. */
async function rollBackTo(build, retire) {
  await makeCurrent(build);
  const gone = releases.get(retire);
  for (const child of [gone.orch, gone.worker]) { child.expectedExit = true; child.kill("SIGTERM"); }
  releases.delete(retire);
}

/** SIGKILLs one control replica (A15) and starts a new one after `downMs`. */
async function restartReplica(index, downMs) {
  const old = controls.get(index);
  running.delete(index);
  old.expectedExit = true;
  old.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, downMs));
  await startReplica(REPLICAS[index]);
}

/** Puts a replica back into the cluster, or takes one out (A30): membership first, so the others stop routing to it. */
async function setReplica(index, up) {
  if (up) {
    await startReplica(REPLICAS[index]);
    writeMembers(running);
    return;
  }
  running.delete(index);
  writeMembers(running);
  await new Promise((r) => setTimeout(r, 2500)); // the replicas re-read the file every second
  const old = controls.get(index);
  old.expectedExit = true;
  old.kill("SIGTERM");
  await new Promise((r) => old.once("exit", r));
}

/** SIGKILLs the worker (the "kill -9" of A3/A4/E2/E6) and starts a fresh one after `downMs`. */
async function restartWorker(downMs) {
  const old = worker;
  old.expectedExit = true;
  old.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, downMs));
  worker = start("orbit-worker", join(venv, "orbit-worker"), [], { cwd: runtimeDir, env: { ...workerEnv, ORBIT_WORKER_BUILD_ID: "v1" } });
  releases.get("v1").worker = worker;
  await waitHttp(`http://127.0.0.1:${PORTS.worker}/`, 60);
}

// Network-outage relay between orbit-web's proxy and control (see header).
const sockets = new Set();
let refuseUntil = 0;
createTcpServer((client) => {
  if (Date.now() < refuseUntil) {
    client.destroy();
    return;
  }
  const upstream = connect(REPLICAS[0].port, "127.0.0.1");
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
  if (req.method === "POST" && url.pathname === "/deploy/release") {
    releaseBuild(url.searchParams.get("build") ?? "v2").then(
      () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ current: url.searchParams.get("build") })),
      (err) => res.writeHead(500).end(String(err)),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/deploy/rollback") {
    Promise.resolve().then(() => rollBackTo("v1", url.searchParams.get("retire") ?? "v2")).then(
      () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ current: "v1" })),
      (err) => res.writeHead(500).end(String(err)),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/control/replica") {
    const index = Number(url.searchParams.get("index") ?? 0);
    setReplica(index, url.searchParams.get("action") === "start").then(
      () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ index })),
      (err) => res.writeHead(500).end(String(err)),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/control/restart") {
    restartReplica(0, Number(url.searchParams.get("downMs") ?? 0)).then(
      () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ restarted: true })),
      (err) => res.writeHead(500).end(String(err)),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/worker/restart") {
    restartWorker(Number(url.searchParams.get("downMs") ?? 0)).then(
      () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ restarted: true })),
      (err) => res.writeHead(500).end(String(err)),
    );
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
  modelMode: REAL_MODEL ? "real" : "mock",
  orbitControl: { repo: "mindreon/orbit-control", ref: CONTROL_REF },
  orbitRuntime: { repo: "mindreon/orbit-runtime", ref: RUNTIME_REF },
  orbitWeb: { ref: out("git", ["rev-parse", "HEAD"], process.cwd()) },
  temporalCli: TEMPORAL_CLI,
  temporal: out(join(BIN, "temporal"), ["--version"]),
  go: out("go", ["env", "GOVERSION"]),
  python: out(python, ["-c", "import platform; print(platform.python_version())"]),
  agentscope: out(python, ["-c", "import importlib.metadata as m; print(m.version('agentscope'))"]),
};
writeFileSync(join(ROOT, "stack.json"), `${JSON.stringify(components, null, 2)}\n`);
console.log(`[stack] up: web http://127.0.0.1:${PORTS.web}  control http://127.0.0.1:${PORTS.control}  (${REAL_MODEL ? "real" : "mock"} model)`);
