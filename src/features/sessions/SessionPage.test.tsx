// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { TypedRunEvent } from "../../api/events";
import type { createStreamController } from "../../api/streamController";
import type { Run, S } from "../../api/types";
import { qk } from "../../platform/queryKeys";
import SessionPage from "./SessionPage";

const { get, post, patch, history, stream } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), history: vi.fn(), stream: vi.fn() }));
vi.mock("../../platform/client", () => ({ api: { get, post, patch } }));
vi.mock("../../api/history", () => ({ fetchRunHistory: history }));
vi.mock("../../api/streamController", () => ({ createStreamController: stream }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" }, principal: { id: "me" } }) }));
vi.mock("../../platform/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../files", () => ({ FileArea: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["cancelled", "failed", "timed_out", "budget_exhausted", "succeeded"] as const)("uses the authoritative %s Run status for a tool without a result", async (status) => {
  get.mockImplementation(async (path: string) => {
    if (path === "/sessions/s") return { id: "s", title: "Session", status: "active", entry_kind: "agent", entry_ref: "dev/notify-agent", message_policy: "queue" };
    if (path === "/sessions/s/runs") return { items: [{ id: "r", session_id: "s", created_at: "2026-10-20T00:00:00Z", status: "running", used_millicredits: 0 }] };
    return { items: [] };
  });
  history.mockResolvedValue({ events: [{ id: "r:main:1:0:1", run_id: "r", member: "main", segment: 1, attempt: 0, type: "tool.call", data: { call_id: "c", tool: "wait_seconds", args_preview: "240", effect_class: "read" } }] });
  stream.mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={["/sessions/s"]}><QueryClientProvider client={client}><Routes><Route path="/sessions/:sessionId" element={<SessionPage />} /></Routes></QueryClientProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText("运行中")).toBeTruthy());
  act(() => { client.setQueryData<{ items: Run[] }>(qk.runs("t", "s"), (page) => ({ items: page!.items.map((run) => ({ ...run, status })) })); });
  await waitFor(() => expect(screen.getByLabelText("未完成")).toBeTruthy());
  expect(screen.queryByLabelText("运行中")).toBeNull();
  view.unmount(); client.clear();
});

it("waits for session metadata and loads archived history without opening a live stream", async () => {
  let resolveSession: (session: { id: string; title: string; status: string; entry_kind: string; entry_ref: string; message_policy: string }) => void = () => {};
  const session = new Promise((resolve) => { resolveSession = resolve; });
  get.mockImplementation(async (path: string) => {
    if (path === "/sessions/s") return session;
    if (path === "/sessions/s/runs") return { items: [{ id: "r", session_id: "s", created_at: "2026-10-20T00:00:00Z", status: "cancelled", used_millicredits: 0 }] };
    return { items: [] };
  });
  history.mockResolvedValue({ events: [{ id: "r:main:1:0:1", run_id: "r", member: "main", segment: 1, attempt: 0, type: "message.final", data: { message_id: "m", text: "Archived history" } }] });
  stream.mockImplementation((options: Parameters<typeof createStreamController>[0]) => ({ start: () => options.onState?.({ status: "fatal", error: new Error("disconnected") }), stop: vi.fn() }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={["/sessions/s"]}><QueryClientProvider client={client}><Routes><Route path="/sessions/:sessionId" element={<SessionPage />} /></Routes></QueryClientProvider></MemoryRouter>);
  await waitFor(() => expect(client.getQueryData(qk.runs("t", "s"))).toBeDefined());
  expect(stream).not.toHaveBeenCalled();
  await act(async () => { resolveSession({ id: "s", title: "Session", status: "archived", entry_kind: "agent", entry_ref: "dev/notify-agent", message_policy: "queue" }); });
  await waitFor(() => expect(screen.getByText("Archived history")).toBeTruthy());
  expect(history).toHaveBeenCalled();
  expect(stream).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText("会话已归档")).toBeTruthy();
  expect(screen.queryByText("实时更新已断开")).toBeNull();
  expect(screen.queryByRole("button", { name: "重新连接" })).toBeNull();
  expect(screen.queryByLabelText("实时")).toBeNull();
  view.unmount(); client.clear();
});

it("stops the live stream and removes disconnected controls when a session is archived", async () => {
  get.mockImplementation(async (path: string) => path === "/sessions/s" ? { id: "s", title: "Session", status: "active", entry_kind: "agent", entry_ref: "dev/notify-agent", message_policy: "queue" } : { items: [] });
  history.mockResolvedValue({ events: [] });
  const stop = vi.fn();
  stream.mockImplementation((options: Parameters<typeof createStreamController>[0]) => ({ start: () => options.onState?.({ status: "fatal", error: new Error("disconnected") }), stop }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={["/sessions/s"]}><QueryClientProvider client={client}><Routes><Route path="/sessions/:sessionId" element={<SessionPage />} /></Routes></QueryClientProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "重新连接" })).toBeTruthy());
  act(() => { client.setQueryData<S["Session"]>(qk.session("t", "s"), (session) => ({ ...session!, status: "archived" })); });
  await waitFor(() => expect(screen.getByPlaceholderText("会话已归档")).toBeTruthy());
  expect(stop).toHaveBeenCalledOnce();
  expect(stream).toHaveBeenCalledOnce();
  expect(screen.queryByText("实时更新已断开")).toBeNull();
  expect(screen.queryByRole("button", { name: "重新连接" })).toBeNull();
  view.unmount(); client.clear();
});

it.each([
  ["interaction.requested", "waiting_approval", "等待审批", "有工具调用等待你审批"],
  ["interaction.requested", "waiting_input", "等待输入", "有问题等待你回答"],
  ["interaction.resolved", "running", "运行中", null],
  ["segment.ended", "waiting_approval", "等待审批", "有工具调用等待你审批"],
] as const)("refreshes the authoritative Run status on %s (%s)", async (type, status, label, banner) => {
  let resourceStatus: S["RunState"] = type === "interaction.resolved" ? "waiting_approval" : "running";
  const run = (): Run => ({ id: "r", session_id: "s", created_at: "2026-10-20T00:00:00Z", status: resourceStatus, used_millicredits: 0 }) as Run;
  get.mockImplementation(async (path: string) => {
    if (path === "/sessions/s") return { id: "s", title: "Session", status: "active", entry_kind: "agent", entry_ref: "dev/notify-agent", message_policy: "queue" };
    if (path === "/sessions/s/runs") return { items: [run()] };
    if (path === "/runs/r") return run();
    return { items: [] };
  });
  history.mockResolvedValue({ events: [{ id: "r:main:1:0:1", run_id: "r", member: "main", segment: 1, attempt: 0, type: "run.started", data: {} }], resumeFrom: "1" });
  let options: Parameters<typeof createStreamController>[0] | undefined;
  const stop = vi.fn();
  stream.mockImplementation((value: typeof options) => { options = value; return { start: vi.fn(), stop }; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(<MemoryRouter initialEntries={["/sessions/s"]}><QueryClientProvider client={client}><Routes><Route path="/sessions/:sessionId" element={<SessionPage />} /></Routes></QueryClientProvider></MemoryRouter>);
  await waitFor(() => expect(options).toBeDefined());
  await waitFor(() => expect(client.getQueryData<{ items: Run[] }>(qk.runs("t", "s"))?.items[0].status).toBe(resourceStatus));
  await waitFor(() => expect(screen.getByText(resourceStatus === "running" ? "运行中" : "等待审批", { exact: true })).toBeTruthy());
  invalidate.mockClear();
  resourceStatus = status;
  const data = type === "interaction.requested" ? { interaction: { interaction_id: "i", kind: status === "waiting_input" ? "ask_user" : "tool_approval", question: { text: "Continue?" }, calls: [] } } : type === "interaction.resolved" ? { interaction_id: "i", decision: { kind: "tool_approval", choice: "allow_once" }, actor: "me" } : { status: "interrupted" };
  act(() => { options?.onEvent({ id: "r:main:1:0:2", run_id: "r", member: "main", segment: 1, attempt: 0, type, data } as TypedRunEvent); });
  await waitFor(() => expect(get.mock.calls.filter(([path]) => path === "/sessions/s/runs")).toHaveLength(2));
  await waitFor(() => expect(client.getQueryData<{ items: Run[] }>(qk.runs("t", "s"))?.items[0].status).toBe(status));
  await waitFor(() => expect(view.container.querySelector('section[data-run-id="r"] [data-run-status]')?.textContent).toBe(label));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.runs("t", "s") });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.run("t", "r") });
  if (banner === "有工具调用等待你审批") expect(screen.getByText("跳到卡片")).toBeTruthy();
  if (banner === "有问题等待你回答") expect(screen.getByText("提问")).toBeTruthy();
  view.unmount();
  expect(stop).toHaveBeenCalledOnce();
  client.clear();
});

function setupSession({ runs = [{ id: "r", session_id: "s", created_at: "2026-10-20T00:00:00Z", status: "running", used_millicredits: 0 }], messages = [], entry = "/sessions/s" }: { runs?: object[]; messages?: object[]; entry?: string } = {}) {
  get.mockImplementation(async (path: string) => {
    if (path === "/sessions/s") return { id: "s", title: "Session", status: "active", entry_kind: "agent", entry_ref: "dev/notify-agent", message_policy: "queue" };
    if (path === "/sessions/s/runs") return { items: runs };
    if (path === "/sessions/s/messages") return { items: messages };
    return { items: [] };
  });
  history.mockResolvedValue({ events: [] }); stream.mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><Routes><Route path="/sessions/:sessionId" element={<SessionPage />} /></Routes></QueryClientProvider></MemoryRouter>);
  return { client, view };
}
it("does not fetch interactions for long histories without interaction events", async () => {
  const { client, view } = setupSession({ runs: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, session_id: "s", created_at: "2026-10-20T00:00:00Z", status: "succeeded", used_millicredits: 0 })) });
  await waitFor(() => expect(view.container.querySelectorAll("section[data-run-id]")).toHaveLength(30));
  await waitFor(() => expect(history).toHaveBeenCalledTimes(20));
  expect(get.mock.calls.some(([path]) => /^\/runs\/[^/]+\/interactions$/.test(path))).toBe(false);
  view.unmount(); client.clear();
});
it.each(["waiting_input", "waiting_approval"])("fetches interactions for %s even before history is expanded", async (status) => {
  const { client, view } = setupSession({ runs: [{ id: "r", session_id: "s", created_at: "2026-10-20T00:00:00Z", status, used_millicredits: 0 }] });
  await waitFor(() => expect(get.mock.calls.some(([path]) => path === "/runs/r/interactions")).toBe(true));
  view.unmount(); client.clear();
});
it("scrolls to a delayed interaction hash exactly once and enables its resource query", async () => {
  const scroll = vi.fn(); const original = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = scroll;
  const { client, view } = setupSession({ entry: "/sessions/s#interaction-i" });
  let resolveHistory: (value: object) => void = () => {};
  history.mockImplementation(() => new Promise((resolve) => { resolveHistory = resolve; }));
  await waitFor(() => expect(history).toHaveBeenCalled());
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => { resolveHistory({ events: [{ id: "r:main:1:0:1", run_id: "r", member: "main", segment: 1, attempt: 0, type: "interaction.requested", data: { interaction: { interaction_id: "i", kind: "ask_user", question: { text: "Continue?", options: [] } } } }] }); });
  await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "center" }));
  await waitFor(() => expect(get.mock.calls.some(([path]) => path === "/runs/r/interactions")).toBe(true));
  act(() => { client.setQueryData(qk.messages("t", "s"), { items: [] }); });
  expect(scroll).toHaveBeenCalledOnce();
  view.unmount(); client.clear(); Element.prototype.scrollIntoView = original;
});
it("interleaves un-run user messages with runs by created_at", async () => {
  const { client, view } = setupSession({ runs: [
    { id: "r1", created_at: "2026-10-20T00:00:01Z", status: "succeeded", used_millicredits: 0 },
    { id: "r2", created_at: "2026-10-20T00:00:03Z", status: "succeeded", used_millicredits: 0 },
  ], messages: [{ id: "m", role: "user", text: "between runs", created_at: "2026-10-20T00:00:02Z" }] });
  await screen.findByText("between runs");
  const first = view.container.querySelector('[data-run-id="r1"]')!, second = view.container.querySelector('[data-run-id="r2"]')!, message = screen.getByText("between runs");
  expect(first.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(message.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  view.unmount(); client.clear();
});
it("inserts a steered user message between earlier and later run output", async () => {
  const { client, view } = setupSession({ messages: [{ id: "steer", run_id: "r", role: "user", text: "steered instruction", created_at: "2026-10-20T00:00:02Z" }] });
  history.mockResolvedValue({ events: [
    { id: "r:main:1:0:1", run_id: "r", member: "main", segment: 1, attempt: 0, type: "message.final", ts: "2026-10-20T00:00:01Z", data: { message_id: "a", text: "earlier answer" } },
    { id: "r:main:1:0:2", run_id: "r", member: "main", segment: 1, attempt: 0, type: "message.final", ts: "2026-10-20T00:00:03Z", data: { message_id: "b", text: "later answer" } },
  ] });
  await screen.findByText("later answer");
  const user = screen.getByText("steered instruction");
  expect(screen.getByText("earlier answer").compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(user.compareDocumentPosition(screen.getByText("later answer")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  view.unmount(); client.clear();
});
it("Escape discards the edited title, including on reopening and blur", async () => {
  const { client, view } = setupSession();
  fireEvent.click(await screen.findByRole("button", { name: "Session" }));
  fireEvent.change(screen.getByLabelText("会话标题"), { target: { value: "discard me" } });
  fireEvent.keyDown(screen.getByLabelText("会话标题"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Session" }));
  expect((screen.getByLabelText("会话标题") as HTMLInputElement).value).toBe("Session");
  fireEvent.blur(screen.getByLabelText("会话标题")); expect(patch).not.toHaveBeenCalled();
  view.unmount(); client.clear();
});
it("archive invalidates tenant session lists", async () => {
  post.mockResolvedValue(undefined);
  const { client, view } = setupSession(); const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.keyDown(await screen.findByRole("button", { name: "更多操作" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "归档" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认归档" }));
  await screen.findByPlaceholderText("会话已归档");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.sessionLists("t") });
  view.unmount(); client.clear();
});
it.each(["running", "paused"])("disables run controls during the %s action mutation", async (status) => {
  post.mockImplementation(() => new Promise(() => {}));
  const { client, view } = setupSession({ runs: [{ id: "r", created_at: "2026-10-20T00:00:00Z", status, used_millicredits: 0 }] });
  const pause = await screen.findByRole("button", { name: status === "paused" ? "继续" : "暂停" });
  fireEvent.click(pause);
  await waitFor(() => expect((pause as HTMLButtonElement).disabled).toBe(true));
  expect((screen.getByRole("button", { name: "停止" }) as HTMLButtonElement).disabled).toBe(true);
  expect(post).toHaveBeenCalledWith(`/runs/r/${status === "paused" ? "resume" : "pause"}`);
  view.unmount(); client.clear();
});
