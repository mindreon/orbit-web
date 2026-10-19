// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import type { Run, S } from "../../api/types";
import { emptyRunStream, reduceRunEvent } from "../../api/timeline";
import { createStreamController } from "../../api/streamController";
import { qk } from "../../platform/queryKeys";
import Page from "./Page";
import { Timeline } from "./Timeline";
const { get, history, stream, identity } = vi.hoisted(() => ({ get: vi.fn(), history: vi.fn(), stream: vi.fn(), identity: { currentTenant: { id: "t" }, principal: { id: "me" }, platformOperator: false } }));
vi.mock("../../platform/client", () => ({ api: { get, post: vi.fn() } }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => identity }));
vi.mock("../../api/history", () => ({ fetchRunHistory: history }));
vi.mock("../../api/streamController", () => ({ createStreamController: stream }));
const run = { id: "r", session_id: "s", status: "succeeded", used_millicredits: 10, budget_millicredits: 100, trigger: "user", created_at: "2026-10-20T00:00:00Z", ops: { trace_id: "trace-secret", temporal_workflow_id: "workflow-secret", temporal_url: "https://example.com/temporal", trace_url: null } } as Run;
beforeEach(() => {
  vi.resetAllMocks(); identity.platformOperator = false;
  history.mockResolvedValue({ events: [], resumeFrom: "40" });
  stream.mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  get.mockImplementation(async (path: string) => path === "/runs/r" ? run : path === "/sessions/s" ? { entry_kind: "agent" } : path.endsWith("/cost") ? { total_millicredits: 10, items: [] } : { items: [] });
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={["/runs/r"]}><QueryClientProvider client={client}><Routes><Route path="/runs/:runId" element={<Page />} /></Routes></QueryClientProvider></MemoryRouter>);
  return { ...view, client };
}
it.each([403, 404])("shows NotFound for an unreadable run (%s), without fetching its history", async (status) => {
  get.mockRejectedValue(new ApiError(status, { code: "NOT_FOUND", message: "hidden", retryable: false }));
  const view = mount(); await screen.findByText("找不到这个页面");
  expect(history).not.toHaveBeenCalled(); expect(screen.queryByText("hidden")).toBeNull();
  view.unmount(); view.client.clear();
});
it.each([[false, true, false], [true, false, false], [true, true, true]])("gates ops by platform operator (%s) and ops presence (%s)", async (operator, hasOps, visible) => {
  identity.platformOperator = operator;
  get.mockImplementation(async (path: string) => path === "/runs/r" ? { ...run, ops: hasOps ? run.ops : undefined } : path === "/sessions/s" ? { entry_kind: "agent" } : path.endsWith("/cost") ? { total_millicredits: 10, items: [] } : { items: [] });
  const view = mount(); await screen.findByRole("heading", { name: "时间线" });
  expect(Boolean(screen.queryByText("运维信息"))).toBe(visible);
  expect(Boolean(screen.queryByText("trace-secret"))).toBe(visible);
  expect(stream).not.toHaveBeenCalled(); view.unmount(); view.client.clear();
});
it("continues live replay at the history cursor and invalidates final resources on end", async () => {
  get.mockImplementation(async (path: string) => path === "/runs/r" ? { ...run, status: "running" } : path === "/sessions/s" ? { entry_kind: "agent" } : path.endsWith("/cost") ? { total_millicredits: 0, items: [] } : { items: [] });
  const view = mount(); await waitFor(() => expect(stream).toHaveBeenCalledOnce());
  const options = stream.mock.calls[0][0] as Parameters<typeof createStreamController>[0];
  expect(options.target).toEqual({ runId: "r" }); expect(options.lastEventId).toBe("40");
  const invalidate = vi.spyOn(view.client, "invalidateQueries");
  options.onEnd?.("finished");
  for (const key of [qk.segments("t", "r"), qk.effects("t", "r"), qk.runInteractions("t", "r"), qk.cost("t", "r")]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  view.unmount(); view.client.clear();
});
it("folds live events into replay and invalidates resources for run, segment-end and interaction events", async () => {
  const envelope = { v: 1 as const, tenant_id: "t", session_id: "s", run_id: "r", member: "writer-1", segment: 1, attempt: 0, ts: "2026-10-20T00:00:00Z" };
  history.mockResolvedValue({ events: [{ ...envelope, id: "r:writer-1:1:0:1", type: "message.final", data: { message_id: "history", text: "历史回复" } }], resumeFrom: "40" });
  get.mockImplementation(async (path: string) => path === "/runs/r" ? { ...run, status: "running" } : path === "/sessions/s" ? { entry_kind: "agent" } : path.endsWith("/cost") ? { total_millicredits: 0, items: [] } : { items: [] });
  const view = mount(); await waitFor(() => expect(stream).toHaveBeenCalledOnce());
  const options = stream.mock.calls[0][0] as Parameters<typeof createStreamController>[0];
  await act(async () => { options.onState({ status: "live" }); });
  const invalidate = vi.spyOn(view.client, "invalidateQueries");
  const timeline = within(await screen.findByTestId("replay-timeline"));
  await act(async () => { options.onEvent({ ...envelope, id: "r:writer-1:1:0:2", type: "message.delta", data: { message_id: "live", delta: "实时" } }); });
  expect(timeline.getByText("历史回复")).toBeTruthy(); expect(timeline.getByText("实时")).toBeTruthy();
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => { options.onEvent({ ...envelope, id: "r:writer-1:1:0:3", type: "message.delta", data: { message_id: "live", delta: "回复" } }); });
  expect(timeline.getByText("实时回复")).toBeTruthy();
  await act(async () => { options.onEvent({ ...envelope, id: "r:writer-1:1:0:4", type: "message.final", data: { message_id: "live", text: "完整实时回复" } }); });
  expect(timeline.getByText("完整实时回复")).toBeTruthy(); expect(timeline.queryByLabelText("正在生成")).toBeNull();
  expect(invalidate).not.toHaveBeenCalled();
  const events: Parameters<typeof options.onEvent>[0][] = [
    { ...envelope, id: "r:writer-1:1:0:5", type: "run.status", data: { status: "waiting_input" } },
    { ...envelope, id: "r:writer-1:1:0:6", type: "segment.ended", data: { status: "interrupted", checkpoint_version: 1, usage: [] } },
    { ...envelope, id: "r:writer-1:1:0:7", type: "interaction.requested", data: { interaction: { interaction_id: "ask", kind: "ask_user", question: { text: "实时问题", options: [] } } } },
    { ...envelope, id: "r:writer-1:1:0:8", type: "interaction.resolved", data: { interaction_id: "ask", actor: "me", decision: { kind: "ask_user", answer: "确认" } } },
    { ...envelope, id: "r:writer-1:1:0:9", type: "run.completed", data: { status: "succeeded" } },
  ];
  const keys = [qk.run("t", "r"), qk.segments("t", "r"), qk.effects("t", "r"), qk.runInteractions("t", "r"), qk.cost("t", "r"), qk.team("t", "r")];
  for (const event of events) {
    invalidate.mockClear();
    await act(async () => { options.onEvent(event); });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(keys);
    if (event.type === "interaction.requested") expect(timeline.getByText("实时问题")).toBeTruthy();
  }
  expect(timeline.getByText("历史回复")).toBeTruthy(); expect(timeline.getByText("完整实时回复")).toBeTruthy();
  view.unmount(); view.client.clear();
});
it.each(["cancelled", "failed"] as const)("shows no board or member-filter errors for a %s team run without a projection", async (status) => {
  get.mockImplementation(async (path: string) => {
    if (path.endsWith("/team")) throw new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false });
    return path === "/runs/r" ? { ...run, status } : path === "/sessions/s" ? { entry_kind: "team" } : path.endsWith("/cost") ? { total_millicredits: 0, items: [] } : { items: [] };
  });
  const view = mount(); await screen.findByText("没有任务板");
  expect(await screen.findByRole("button", { name: "全部" })).toBeTruthy();
  expect(screen.queryByText(/读取任务板失败|读取失败/)).toBeNull();
  expect(screen.getByTestId("replay-timeline")).toBeTruthy();
  view.unmount(); view.client.clear();
});
it("contains replay board render failures without losing the timeline or resource sections", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  get.mockImplementation(async (path: string) => path === "/runs/r" ? run : path === "/sessions/s" ? { entry_kind: "team" } : path.endsWith("/team") ? { board: { tasks: [{ task_id: "bad", title: "task", status: "pending", deps: 42 }] }, members: [], finished: true } : path.endsWith("/cost") ? { total_millicredits: 10, items: [] } : { items: [] });
  const view = mount();
  await screen.findByText(/任务板显示失败/);
  expect(screen.getByRole("heading", { name: "时间线" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "成本" })).toBeTruthy();
  expect(screen.queryByText("页面出错了")).toBeNull();
  view.unmount(); view.client.clear(); log.mockRestore();
});
it("filters messages, tools, approvals and member messages by their emitting member, read-only", () => {
  const state = ["writer-1", "writer-2"].reduce((state, member) => [
    { type: "message.final", data: { message_id: `m-${member}`, text: `reply-${member}` } },
    { type: "tool.call", data: { call_id: `c-${member}`, tool: `tool-${member}`, effect_class: "read", args_preview: "{}" } },
    { type: "team.message", data: { message_id: `tm-${member}`, from: member, to: "leader", text: `note-${member}` } },
    { type: "interaction.requested", data: { interaction: { interaction_id: `i-${member}`, kind: "ask_user", question: { text: `question-${member}`, options: [] } } } },
  ].reduce((value, event, i) => reduceRunEvent(value, { ...event, id: `r:${member}:1:0:${i + 1}`, member, segment: 1, attempt: 0 }), state), emptyRunStream);
  const onResolve = vi.fn();
  const props = { state, principalId: "me", interactions: [] as S["Interaction"][], onResolve, readOnly: true };
  const view = render(<Timeline {...props} member="writer-1" />);
  expect(screen.getByText("reply-writer-1")).toBeTruthy(); expect(screen.getByText("tool-writer-1")).toBeTruthy(); expect(screen.getByText("writer-1 → leader")).toBeTruthy(); expect(screen.getByText("question-writer-1")).toBeTruthy();
  expect(screen.queryByText("reply-writer-2")).toBeNull(); expect(screen.queryByText("tool-writer-2")).toBeNull(); expect(screen.queryByText("writer-2 → leader")).toBeNull(); expect(screen.queryByText("question-writer-2")).toBeNull();
  expect(screen.queryByRole("button", { name: "提交回答" })).toBeNull();
  view.rerender(<Timeline {...props} />); expect(screen.getByText("reply-writer-2")).toBeTruthy();
});
it("uses the member filter chips and shares the session interactions cache shape", async () => {
  const event = { id: "r:writer-1:1:0:1", run_id: "r", member: "writer-1", segment: 1, attempt: 0, type: "message.final", data: { message_id: "m", text: "仅此成员回复" } };
  history.mockResolvedValue({ events: [event] });
  get.mockImplementation(async (path: string) => path === "/runs/r" ? run : path === "/sessions/s" ? { entry_kind: "team" } : path.endsWith("/team") ? { board: { tasks: [], roster: [] }, members: [{ name: "writer-1", status: "finished", role: "teammate" }, { name: "writer-2", status: "finished", role: "teammate" }], finished: true, summary: "总结内容" } : path.endsWith("/cost") ? { total_millicredits: 10, items: [] } : { items: [] });
  const view = mount();
  view.client.setQueryData(qk.runInteractions("t", "r"), { items: [], capped: false });
  await screen.findByText("仅此成员回复");
  fireEvent.click(await screen.findByRole("button", { name: "writer-2" })); expect(screen.queryByText("仅此成员回复")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "全部" })); expect(screen.getByText("仅此成员回复")).toBeTruthy();
  view.unmount(); view.client.clear();
});
