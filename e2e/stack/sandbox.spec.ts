/**
 * Acceptance E35-E41 (15 M10): the sandbox is a resource the agent calls, not the place it runs.
 *
 * The agent has Bash, Read, Write and Edit on the task's workspace. The workspace is taken when a tool first needs it,
 * kept for the attempt, and saved at its end, so the next attempt of the task finds the files again. A file the agent
 * leaves there is an artifact; what the agent says never is.
 *
 * The mock model drives the tools: `file:<path>|<text>` writes a file (a relative path is under /workspace), `sh:<cmd>`
 * runs a shell command, and `prompt:` shows the system prompt.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { eventually, sql, waitForStatus } from "./tasks";

const unique = (label: string) => `${label} ${Date.now()}`;
// What the local backend keeps on the host for the leases that are open, and nothing else (the files live in snapshots).
const LEASE_ROOT = join(process.env.ORBIT_WORKSPACE_ROOT ?? "/tmp/orbit-workspaces", "default");
const openLeaseDirs = () => (existsSync(LEASE_ROOT) ? readdirSync(LEASE_ROOT).filter((name) => name.startsWith("ws_")).length : 0);
// The skill the catalog fixture of up.mjs holds, with a SKILL.md carrying this mark (see task-config.spec.ts).
const SKILL = { id: "@0froq/nuxt", mark: "e2e-skill-mark" };

type Manifest = { manifest_id: string; entries: Array<{ name: string; media_type: string }> };

async function start(request: APIRequestContext, title: string, goal: string, config?: Record<string, unknown>): Promise<string> {
  const response = await request.post("/v1/tasks", { data: { title, goal, ...(config ? { config } : {}) }, timeout: 120_000 });
  expect(response.status()).toBe(201);
  return (await response.json()).task_id as string;
}

const say = async (request: APIRequestContext, taskId: string, text: string) => {
  const response = await request.post(`/v1/tasks/${taskId}/messages`, { data: { text } });
  expect(response.ok()).toBeTruthy();
};

const attempts = (taskId: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`));
const finalCount = (taskId: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final'`));
/** The agent's n-th reply (1-based), whole: a reply may have many lines. */
const finalNo = (taskId: string, n: number) => sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.agent_final' ORDER BY seq OFFSET ${n - 1} LIMIT 1`);

/** Waits for attempt `count` to start and the task to rest again; returns what the agent said last. */
async function restedAfter(request: APIRequestContext, taskId: string, count: number): Promise<string> {
  await eventually(async () => attempts(taskId), (n) => n >= count, `attempt ${count} to start`, 60_000);
  await eventually(async () => finalCount(taskId), (n) => n >= count, `the reply of attempt ${count}`, 90_000);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  return finalNo(taskId, finalCount(taskId));
}

const manifests = async (request: APIRequestContext, taskId: string) =>
  ((await (await request.get(`/v1/tasks/${taskId}/artifacts`)).json()).items as Manifest[]);
const artifactNames = async (request: APIRequestContext, taskId: string) => (await manifests(request, taskId)).flatMap((m) => m.entries.map((e) => e.name));

async function download(request: APIRequestContext, taskId: string, name: string): Promise<string> {
  const manifest = (await manifests(request, taskId)).reverse().find((m) => m.entries.some((e) => e.name === name));
  expect(manifest, `a manifest with ${name}`).toBeTruthy();
  const url = (await (await request.get(`/v1/artifacts/${manifest!.manifest_id}/url?name=${encodeURIComponent(name)}`)).json()).url as string;
  const body = await request.get(url);
  expect(body.status()).toBe(200);
  return body.text();
}

async function approvePending(request: APIRequestContext, taskId: string): Promise<void> {
  const task = await eventually(async () => (await (await request.get(`/v1/tasks/${taskId}`)).json()) as { pending_approvals?: string[] }, (t) => (t.pending_approvals ?? []).length > 0, "a call to wait for approval", 60_000);
  const response = await request.post(`/v1/tasks/${taskId}/approvals/${task.pending_approvals![0]}`, { data: { decision: "approve" } });
  expect(response.status()).toBe(202);
}

test("E35 only a file left in the sandbox is an artifact; what the agent says is not", async ({ request }) => {
  const plain = await start(request, unique("E35 chat"), "say hello");
  await waitForStatus(request, plain, "COMPLETED", 90_000);
  expect(await artifactNames(request, plain)).toEqual([]);

  const taskId = await start(request, unique("E35"), "file:notes/report.md|# the report");
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const all = (await manifests(request, taskId)).flatMap((m) => m.entries);
  expect(all.map((e) => e.name)).toEqual(["notes/report.md"]);
  expect(all[0].media_type).toBe("text/markdown");
  expect(await download(request, taskId, "notes/report.md")).toBe("# the report");
});

test("E36 the next attempt of a task finds the files the one before left, and no workspace directory is left behind", async ({ request }) => {
  const before = openLeaseDirs();
  const taskId = await start(request, unique("E36"), "file:notes/report.md|# kept between attempts");
  await waitForStatus(request, taskId, "COMPLETED", 90_000);

  await say(request, taskId, "sh:cat notes/report.md");
  const reply = await restedAfter(request, taskId, 2);
  expect(reply).toContain("# kept between attempts");
  // The workspace is the task's: the second attempt's manifest still lists the file it only read.
  expect(await artifactNames(request, taskId)).toContain("notes/report.md");
  // A workspace is a lease: once it is given back its directory is gone, and the files are in the snapshot.
  expect(openLeaseDirs()).toBe(before);
});

test("E37 in ask mode nothing can be written", async ({ request }) => {
  const taskId = await start(request, unique("E37"), "file:notes/nope.md|never written", { mode: "ask" });
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect(await artifactNames(request, taskId)).toEqual([]);
  expect(await eventually(async () => finalNo(taskId, 1), (text) => text !== "", "the agent's reply")).toContain("read-only");
});

test("E38 a command that changes the workspace waits for a person, then runs in it", async ({ request }) => {
  const taskId = await start(request, unique("E38"), "sh:printf made > out.txt");
  await approvePending(request, taskId);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect(await download(request, taskId, "out.txt")).toBe("made");
});

// The local backend has no container around it, so the file calls are what keeps the agent inside the workspace.
test("E39 a path outside the workspace is refused, even when a person allowed the call", async ({ request }) => {
  const escape = `/etc/orbit-escape-${Date.now()}.txt`;
  const taskId = await start(request, unique("E39"), `file:${escape}|escaped`);
  await approvePending(request, taskId);
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  expect(existsSync(escape)).toBe(false);
  expect(await artifactNames(request, taskId)).toEqual([]);
  expect(finalNo(taskId, 1)).toContain("outside the workspace");
});

test("E40 a skill's files are readable in the workspace at the place the agent is told", async ({ request }) => {
  await eventually(async () => (await request.get(`/v1/skills/${SKILL.id}`)).status(), (s) => s === 200, "the fixture skill in the catalog", 120_000);
  const taskId = await start(request, unique("E40"), "prompt:", { skills: [SKILL.id] });
  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const place = /\/workspace\/\.skills\/[^\s<"')]+/.exec(finalNo(taskId, 1))?.[0];
  expect(place, "the skill's place in the prompt").toBeTruthy();

  await say(request, taskId, `sh:cat ${place}/SKILL.md`);
  expect(await restedAfter(request, taskId, 2)).toContain(SKILL.mark);
});

/** The sandboxes that are open now and whether the first file is in one; and what the reaper does to them. */
const DOCKER = process.env.ORBIT_WORKSPACE_BACKEND === "docker";
const containers = () => execFileSync("docker", ["ps", "-q", "--filter", "name=orbit-ws_"], { encoding: "utf8" }).split("\n").filter(Boolean);
const holdsFirstFile = () =>
  DOCKER
    ? containers().some((id) => { try { execFileSync("docker", ["exec", id, "test", "-e", "/workspace/kept.md"]); return true; } catch { return false; } })
    : existsSync(LEASE_ROOT) && readdirSync(LEASE_ROOT).some((name) => name.startsWith("ws_") && existsSync(join(LEASE_ROOT, name, "kept.md")));
const reclaim = () => {
  if (DOCKER) for (const id of containers()) execFileSync("docker", ["rm", "-f", id]);
  else for (const name of existsSync(LEASE_ROOT) ? readdirSync(LEASE_ROOT) : []) rmSync(join(LEASE_ROOT, name), { recursive: true, force: true });
};

test("E41 a workspace taken away in the middle of an attempt is taken again, and the agent is told what it lost", async ({ request }) => {
  // The attempt writes a file, holds for a few seconds, then reads the file and writes another.
  const taskId = await start(request, unique("E41"), `chain:file:kept.md|before;;slow:e41-${Date.now()};;sh:cat kept.md;;file:after.md|later`);
  await eventually(async () => holdsFirstFile(), Boolean, "the first file in the workspace", 30_000);
  reclaim();

  await waitForStatus(request, taskId, "COMPLETED", 90_000);
  const reply = finalNo(taskId, 1);
  // The read that found no workspace was told so, and the attempt went on in a new one.
  expect(reply).toContain("reclaimed");
  expect(reply).toContain("wrote");
  expect(await artifactNames(request, taskId)).toEqual(["after.md"]);
  expect(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started'`)).toBe("1");
});
