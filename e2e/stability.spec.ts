/**
 * A long running team task must not make the page hammer the API: the event stream replays the whole history on connect,
 * and every durable event used to start its own task/plan/artifacts refresh (hundreds of requests, then ERR_INSUFFICIENT_RESOURCES
 * and a failed lazy chunk). Route-mocked API; requests are counted per URL.
 *
 * Ways this can fail (each is asserted below):
 *   S1 replaying a long history fires more than a handful of GET task / plan / artifacts requests
 *   S2 a live durable event after the replay no longer refreshes the task, plan and artifacts
 *   S3 the page shows the route error page
 */
import { expect, test } from "@playwright/test";

const TASK_ID = "task_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const START = "2026-10-05T08:00:00Z";
const REPLAYED = 400;

const task = {
  task_id: TASK_ID, tenant_id: "tenant-a", workflow_id: "task/tenant-a/demo", title: "长任务", goal: "跑很久的团队任务。", mode: "single", status: "RUNNING",
  profile: "writer@1", plan_version: 1, created_by: "user-a", created_at: START, updated_at: START, budgets: {}, usage: {},
};
const members = [
  { role: "member-1", label: "主编", expert: "writer@1", name: "文案专家", description: "统筹" },
  { role: "member-2", label: "研究员", expert: "research@1", name: "调研专家", description: "找资料" },
];
const teamConfig = { config_version: 2, expert: "writer@1", skills: null, connector_ids: null, mode: "default", team_ref: "team1@1", team: { ref: "team1@1", leader: "member-1", members } };
const plan = { plan_version: 1, hash: `sha256:${"a".repeat(64)}`, nodes: [{ node_id: "n_1", type: "agent_turn", title: "Explore and plan", status: "RUNNING", depends_on: [], workspace_access: "write", owner_profile: "writer@1", frozen: true, attempt_count: 1 }], edges: [] };

const event = (seq: number, type: string, payload: Record<string, unknown>) => ({ seq, event_id: `evt_${seq}`, task_id: TASK_ID, type, source: "workflow", payload, occurred_at: START });

/** The first event opens the task, then the leader and a member call tools back and forth; `i` keeps every event distinct. */
function history() {
  const list = [event(1, "task.created", { goal: task.goal, title: task.title }), event(2, "attempt.started", { attempt_id: "att_1", node_id: "n_1", attempt_no: 1, profile: "writer@1" })];
  for (let i = 3; i <= REPLAYED; i += 1) {
    list.push(event(i, "team.message", { node_id: "n_1", attempt_id: "att_1", kind: i % 2 ? "assign" : "reply", from_role: i % 2 ? "member-1" : "member-2", from_label: i % 2 ? "主编" : "研究员", role: i % 2 ? "member-1" : "member-2", to_roles: [i % 2 ? "member-2" : "member-1"], text: `第 ${i} 条`, round: 1, hop: 0, artifacts: [] }));
  }
  return list;
}

test("a long history replay does not flood the API, and a live event still refreshes", async ({ page }) => {
  const feed = history();
  await page.addInitScript((items) => {
    class FakeEventSource {
      onopen: ((event: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      constructor() {
        setTimeout(() => {
          this.onopen?.({});
          for (const item of items) this.onmessage?.({ data: JSON.stringify(item) });
        }, 20);
        Object.assign(window, { __pushEvent: (item: unknown) => this.onmessage?.({ data: JSON.stringify(item) }) });
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, feed);

  const hits = { task: 0, plan: 0, artifacts: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET") return;
    const { pathname } = new URL(request.url());
    if (pathname === `/v1/tasks/${TASK_ID}`) hits.task += 1;
    else if (pathname === `/v1/tasks/${TASK_ID}/plan`) hits.plan += 1;
    else if (pathname === `/v1/tasks/${TASK_ID}/artifacts`) hits.artifacts += 1;
  });
  await page.route("**/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (pathname === "/v1/tasks") return json({ items: [task] });
    if (pathname === `/v1/tasks/${TASK_ID}`) return json(task);
    if (pathname.endsWith("/plan")) return json(plan);
    if (pathname.endsWith("/artifacts")) return json({ items: [] });
    if (pathname.endsWith("/config")) return json(teamConfig);
    if (pathname === "/v1/experts") return json({ items: [] });
    if (pathname === "/v1/models") return json({ items: ["test-model"], default: "test-model" });
    return json({ items: [], total: 0 });
  });

  await page.goto(`/tasks/${TASK_ID}`);
  await expect(page.getByTestId("team-roster")).toHaveCount(1);
  await page.waitForTimeout(3000);

  // S1: the initial load plus a coalesced follow-up for the replay (the dev server's StrictMode mounts twice), not one round per replayed event.
  for (const [name, count] of Object.entries(hits)) expect(count, `GET ${name} count after replaying ${REPLAYED} events`).toBeLessThanOrEqual(6);
  await expect(page.getByText("出错了")).toHaveCount(0); // S3

  // S2: a durable event arriving later is a legitimate refresh.
  const before = { ...hits };
  await page.evaluate((item) => (window as unknown as { __pushEvent: (event: unknown) => void }).__pushEvent(item), event(REPLAYED + 1, "message.agent_final", { attempt_id: "att_1", text: "新进展" }));
  await expect.poll(() => hits.task).toBeGreaterThan(before.task);
  await expect.poll(() => hits.plan).toBeGreaterThan(before.plan);
  await expect.poll(() => hits.artifacts).toBeGreaterThan(before.artifacts);
  await page.waitForTimeout(500);
  expect(hits.task - before.task).toBeLessThanOrEqual(2);
});
