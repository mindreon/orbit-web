import { describe, expect, it } from "vitest";
import type { TaskEvent } from "./tasks";
import type { NodeRole } from "./display";
import { executionChecklist, latestTodos, nodeChecklistStatus, type ChecklistInput } from "./todos";

let seq = 0;
const finished = (payload: Record<string, unknown>): TaskEvent => ({ seq: ++seq, event_id: `evt_${seq}`, task_id: "t", type: "tool.call_finished", source: "worker", payload, occurred_at: "2026-10-06T00:00:00Z" });
const todoCall = (items: Array<[string, string]>, extra: Record<string, unknown> = {}) =>
  finished({ tool_name: "TodoWrite", state: "success", args_preview: JSON.stringify({ todos: items.map(([content, status]) => ({ content, status })) }), ...extra });

describe("latestTodos", () => {
  it("is null when the task never wrote a list", () => {
    expect(latestTodos([])).toBeNull();
    expect(latestTodos([finished({ tool_name: "Bash", state: "success", args_preview: "{}" })])).toBeNull();
  });

  it("takes the whole list of the latest successful call, not a merge", () => {
    const events = [todoCall([["a", "pending"], ["b", "pending"]]), finished({ tool_name: "Bash", state: "success" }), todoCall([["a", "completed"], ["b", "in_progress"], ["c", "pending"]])];
    expect(latestTodos(events)).toEqual([
      { content: "a", status: "completed" },
      { content: "b", status: "in_progress" },
      { content: "c", status: "pending" },
    ]);
  });

  it("only reads finished, successful calls", () => {
    const started: TaskEvent = { ...todoCall([["x", "pending"]]), type: "tool.call_started" };
    const failed = finished({ tool_name: "TodoWrite", state: "error", args_preview: JSON.stringify({ todos: [{ content: "y", status: "pending" }] }) });
    expect(latestTodos([todoCall([["a", "pending"]]), started, failed])).toEqual([{ content: "a", status: "pending" }]);
  });

  it("skips a call with an empty or unreadable input and falls back to the one before", () => {
    const events = [todoCall([["a", "pending"]]), finished({ tool_name: "TodoWrite", state: "success", args_preview: "" }), finished({ tool_name: "TodoWrite", state: "success", args_preview: '{"todos":[{"content":"x"' })];
    expect(latestTodos(events)).toEqual([{ content: "a", status: "pending" }]);
    expect(latestTodos([finished({ tool_name: "TodoWrite", state: "success", args_preview: '{"todos":"nope"}' })])).toBeNull();
  });

  it("skips items that are not content with a known status", () => {
    const args = JSON.stringify({ todos: [{ content: "ok", status: "pending" }, { content: "", status: "pending" }, { content: "x", status: "weird" }, null, 3] });
    expect(latestTodos([finished({ tool_name: "TodoWrite", state: "success", args_preview: args })])).toEqual([{ content: "ok", status: "pending" }]);
  });

  it("in a team follows the leader, not a member's own list", () => {
    const events = [todoCall([["lead", "in_progress"]], { team_role: "lead" }), todoCall([["mine", "pending"]], { team_role: "member-2" })];
    expect(latestTodos(events, "lead")).toEqual([{ content: "lead", status: "in_progress" }]);
    expect(latestTodos(events)).toEqual([{ content: "mine", status: "pending" }]);
  });
});

describe("executionChecklist", () => {
  const member = (role: string, name: string): NodeRole => ({ kind: "member", role, label: "", expert: "e@1", name });
  const base: ChecklistInput = { events: [], leader: "lead", nodes: [], roles: {}, stageNodeIds: new Set(), liveNodes: {}, roster: new Map() };
  const plan = [
    { node_id: "n1", type: "agent_turn", title: "后端", status: "RUNNING" },
    { node_id: "n2", type: "agent_turn", title: "前端", status: "COMPLETED" },
    { node_id: "n3", type: "agent_turn", title: "收尾", status: "FAILED" },
    { node_id: "n4", type: "agent_turn", title: "后续", status: "PENDING" },
    { node_id: "n0", type: "agent_turn", title: "Explore and plan", status: "COMPLETED" },
  ];
  const roles = { n1: member("be", "allan"), n2: member("fe", "hooly"), n3: member("qa", "q"), n4: member("be", "allan"), n0: { ...member("lead", "x"), kind: "leader" as const } };

  it("maps node states: running is in progress, done is completed, failed and cancelled fail, the rest wait", () => {
    expect(["RUNNING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED", "PENDING", "BLOCKED"].map(nodeChecklistStatus)).toEqual(["in_progress", "in_progress", "completed", "failed", "failed", "pending", "pending"]);
  });

  it("lists one item per member node in plan order, with its owner, and leaves the opening plan out", () => {
    const items = executionChecklist({ ...base, nodes: plan, roles })!;
    expect(items.map((i) => [i.content, i.status, i.owner?.name])).toEqual([
      ["后端", "in_progress", "allan"],
      ["前端", "completed", "hooly"],
      ["收尾", "failed", "q"],
      ["后续", "pending", "allan"],
    ]);
  });

  it("follows the newest event state over the plan snapshot, and picks up later-round nodes", () => {
    const items = executionChecklist({ ...base, nodes: plan, roles, liveNodes: { n1: { status: "COMPLETED" }, n4: { status: "RUNNING" } } })!;
    expect(items.map((i) => i.status)).toEqual(["completed", "completed", "failed", "in_progress"]);
  });

  it("takes a member's latest node from the roster, so the checklist cannot call done what the roster calls working", () => {
    const items = executionChecklist({ ...base, nodes: plan, roles, roster: new Map([["fe", "running"], ["be", "waiting"]]) })!;
    // be's earlier node keeps its own state; its latest (n4) and fe's only node follow the roster.
    expect(items.map((i) => i.status)).toEqual(["in_progress", "in_progress", "failed", "pending"]);
  });

  it("counts a node the leader owns like any other, with the leader as its owner; the opening plan and reviews are not items", () => {
    const lead: NodeRole = { kind: "leader", role: "lead", label: "领队", expert: "e@1", name: "" };
    const nodes = [{ node_id: "p", type: "agent_turn", title: "Explore and plan", status: "COMPLETED" }, { node_id: "w", type: "agent_turn", title: "整合文档", status: "RUNNING" }, { node_id: "r", type: "agent_turn", title: "领队复盘", status: "COMPLETED" }];
    const items = executionChecklist({ ...base, nodes, roles: { p: lead, w: lead, r: { ...lead, kind: "review" } } })!;
    expect(items).toEqual([{ content: "整合文档", status: "in_progress", owner: { role: "lead", name: "", label: "领队" } }]);
  });

  describe("a user's message is not a step", () => {
    const lead: NodeRole = { kind: "leader", role: "lead", label: "领队", expert: "e@1", name: "" };
    const userMessage = (text: string, mentions: string[] = []): TaskEvent => ({ seq: ++seq, event_id: `evt_${seq}`, task_id: "t", type: "message.user", source: "workflow", payload: { text, delivery: "queue", mentions }, occurred_at: "2026-10-06T00:00:00Z" });
    const planned = [
      { node_id: "p", type: "agent_turn", title: "Explore and plan", status: "COMPLETED", depends_on: [] },
      { node_id: "a", type: "agent_turn", title: "搭建后端", status: "COMPLETED", depends_on: ["p"], parent_node_id: "p" },
      { node_id: "r", type: "agent_turn", title: "领队复盘", status: "COMPLETED", depends_on: ["a"], review_round: 1 },
    ];
    const plannedRoles = { p: lead, a: member("be", "allan"), r: { ...lead, kind: "review" as const } };

    it("leaves out the node the leader opens to answer a message, whatever the user wrote", () => {
      const nodes = [...planned, { node_id: "u1", type: "agent_turn", title: "你已经 review 过了么？", status: "RUNNING", depends_on: [] }, { node_id: "u2", type: "agent_turn", title: "改成前后端分离的，react + python/fastapi", status: "COMPLETED", depends_on: [] }];
      const events = [userMessage("改成前后端分离的，react + python/fastapi"), userMessage("你已经 review 过了么？", ["lead"])];
      const items = executionChecklist({ ...base, events, nodes, roles: { ...plannedRoles, u1: lead, u2: lead } })!;
      expect(items.map((i) => i.content)).toEqual(["搭建后端"]);
    });

    it("leaves out the node an @-mention opens for a member, and only reads the first line of a long message", () => {
      const nodes = [...planned, { node_id: "u", type: "agent_turn", title: "@allan: 简单介绍下你的实现", status: "COMPLETED", depends_on: [] }];
      const events = [userMessage("简单介绍下你的实现\n顺便说下用了哪些库", ["be"])];
      const items = executionChecklist({ ...base, events, nodes, roles: { ...plannedRoles, u: member("be", "allan") } })!;
      expect(items.map((i) => i.content)).toEqual(["搭建后端"]);
    });

    it("still lists a planned node that happens to share the user's words when it hangs off the plan", () => {
      const nodes = [...planned, { node_id: "w", type: "agent_turn", title: "写文档", status: "PENDING", depends_on: ["a"], parent_node_id: "p" }];
      const items = executionChecklist({ ...base, events: [userMessage("写文档")], nodes, roles: { ...plannedRoles, w: member("be", "allan") } })!;
      expect(items.map((i) => i.content)).toEqual(["搭建后端", "写文档"]);
    });

    it("does not let the member's roster state, which now reflects answering the message, rewrite a finished step", () => {
      const nodes = [...planned, { node_id: "u", type: "agent_turn", title: "@allan: 介绍下", status: "RUNNING", depends_on: [] }];
      const items = executionChecklist({ ...base, events: [userMessage("介绍下", ["be"])], nodes, roles: { ...plannedRoles, u: member("be", "allan") }, roster: new Map([["be", "running"]]) })!;
      expect(items.map((i) => [i.content, i.status])).toEqual([["搭建后端", "completed"]]);
    });

    it("falls back to the leader's TodoWrite list when only the user's messages made nodes", () => {
      const nodes = [{ node_id: "u", type: "agent_turn", title: "继续", status: "RUNNING", depends_on: [] }];
      const todos = [todoCall([["整理", "in_progress"]]), userMessage("继续")];
      expect(executionChecklist({ ...base, events: todos, nodes, roles: { u: lead } })).toEqual([{ content: "整理", status: "in_progress" }]);
    });
  });

  it("uses TodoWrite when no node was made for a member (single agent, team stage) and ignores a leader's list otherwise", () => {
    const todos = [todoCall([["a", "completed"]])];
    expect(executionChecklist({ ...base, events: todos })).toEqual([{ content: "a", status: "completed" }]);
    expect(executionChecklist({ ...base, events: todos, nodes: [{ node_id: "s", type: "team_stage", title: "团队", status: "RUNNING" }], roles: { s: member("be", "x") }, stageNodeIds: new Set(["s"]) })).toEqual([{ content: "a", status: "completed" }]);
    expect(executionChecklist({ ...base, events: todos, nodes: plan, roles })!.map((i) => i.content)).not.toContain("a");
    expect(executionChecklist(base)).toBeNull();
  });
});
