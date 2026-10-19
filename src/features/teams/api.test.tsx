// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { qk } from "../../platform/queryKeys";
import { useTeam, useTeamSignal } from "./api";
const { get, identity } = vi.hoisted(() => ({ get: vi.fn(), identity: { currentTenant: { id: "t" } } }));
vi.mock("../../platform/client", () => ({ api: { get } }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => identity }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); get.mockReset(); identity.currentTenant.id = "t"; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><QueryClientProvider client={client}>{children}</QueryClientProvider></StrictMode>;
  return { client, wrapper };
}
it("normalizes the exact early roster-only projection without dropping members", async () => {
  const roster = [{ name: "writer", role: "teammate", status: "idle", description: "writes" }];
  const members = [{ name: "writer", role: "teammate", status: "idle", turn: 0 }];
  get.mockResolvedValue({ board: { roster }, members, finished: false, summary: "" });
  const { wrapper, client } = setup();
  const view = renderHook(() => useTeam("r"), { wrapper });
  await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
  expect(view.result.current.data).toEqual({ board: { roster, tasks: [] }, members, finished: false, summary: "" });
  view.unmount(); client.clear();
});
it("applies all missing board, task and review defaults while preserving populated values", async () => {
  const task = { task_id: "task", title: "write", status: "in_review", attempts: 1, description: "draft", review: { round: 2 } };
  const populated = { ...task, task_id: "populated", deps: ["task"], files: ["draft.md"], narrowed_tools: ["read"], review: { reviewers: ["reviewer"], votes: [{ reviewer: "reviewer", verdict: "approve", comment: "ok" }] } };
  const payload = { board: { tasks: [task, populated] }, finished: true };
  get.mockResolvedValue(payload);
  const { wrapper, client } = setup(); const view = renderHook(() => useTeam("r"), { wrapper });
  await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
  expect(view.result.current.data).toEqual({ board: { roster: [], tasks: [{ ...task, deps: [], files: [], narrowed_tools: [], review: { round: 2, reviewers: [], votes: [] } }, populated] }, members: [], summary: "", finished: true });
  expect(payload.board.tasks[0]).not.toHaveProperty("deps");
  view.unmount(); client.clear();
});
it("defaults an absent board and members", async () => {
  get.mockResolvedValue({ finished: false });
  const { wrapper, client } = setup(); const view = renderHook(() => useTeam("r"), { wrapper });
  await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
  expect(view.result.current.data).toEqual({ board: { roster: [], tasks: [] }, members: [], finished: false, summary: "" });
  view.unmount(); client.clear();
});
it("keeps a just-started missing projection empty, then fetches its eventual board", async () => {
  const missing = new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false });
  vi.useFakeTimers();
  get.mockRejectedValue(missing);
  const { wrapper, client } = setup(); const view = renderHook(() => useTeam("r", true), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.isSuccess).toBe(true);
  expect(view.result.current.data).toBeNull();
  get.mockResolvedValue({ board: { roster: [] }, members: [], finished: false, summary: "" });
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(view.result.current.data?.board.tasks).toEqual([]);
  view.unmount(); client.clear();
});
it("keeps an ended run without a team projection null and does not poll", async () => {
  vi.useFakeTimers();
  get.mockRejectedValue(new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false }));
  const { wrapper, client } = setup(); const view = renderHook(() => useTeam("r", false), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.isSuccess).toBe(true); expect(view.result.current.data).toBeNull();
  const calls = get.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(get).toHaveBeenCalledTimes(calls);
  view.unmount(); client.clear();
});
it("stops polling when a null board becomes terminal, even with an active refetch in flight", async () => {
  vi.useFakeTimers();
  const missing = new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false });
  get.mockRejectedValue(missing);
  const { wrapper, client } = setup();
  const view = renderHook(({ active }) => useTeam("r", active), { wrapper, initialProps: { active: true } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.data).toBeNull();
  let reject!: (error: unknown) => void;
  get.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  let refetch!: ReturnType<typeof view.result.current.refetch>;
  await act(async () => { refetch = view.result.current.refetch(); await vi.advanceTimersByTimeAsync(1); });
  expect(client.isFetching({ queryKey: qk.team("t", "r") })).toBe(1);
  view.rerender({ active: false });
  await act(async () => { reject(missing); await refetch; });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current.isSuccess).toBe(true); expect(view.result.current.data).toBeNull();
  expect(client.getQueryState(qk.team("t", "r"))).toMatchObject({ status: "success", data: null, error: null, fetchStatus: "idle" });
  const calls = get.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(get).toHaveBeenCalledTimes(calls);
  view.unmount(); client.clear();
});
it.each([[false, 403], [true, 403], [true, 500]])("does not hide a team failure (active=%s, status=%s)", async (active, status) => {
  const error = new ApiError(status, { code: "FAILURE", message: "failed", retryable: false });
  get.mockRejectedValue(error);
  const { wrapper, client } = setup(); const view = renderHook(() => useTeam("r", active), { wrapper });
  await waitFor(() => expect(view.result.current.error).toBe(error));
  view.unmount(); client.clear();
});
it("throttles continuous signals within one second of the first unseen signal", async () => {
  vi.useFakeTimers(); const { wrapper, client } = setup(); const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderHook(({ signal }) => useTeamSignal("r", signal), { wrapper, initialProps: { signal: 0 } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(invalidate).not.toHaveBeenCalled();
  view.rerender({ signal: 1 });
  for (let signal = 2; signal <= 5; signal++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    view.rerender({ signal });
  }
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: qk.team("t", "r") });
  view.rerender({ signal: 6 });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(invalidate).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(invalidate).toHaveBeenCalledTimes(2);
  view.unmount(); client.clear();
});
it("cancels old run, tenant and unmounted timers even in StrictMode", async () => {
  vi.useFakeTimers(); const { wrapper, client } = setup(); const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderHook(({ runId }) => useTeamSignal(runId, 1), { wrapper, initialProps: { runId: "old" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  view.rerender({ runId: "new" });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  identity.currentTenant.id = "other"; view.rerender({ runId: "new" });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: qk.team("other", "new") });
  view.rerender({ runId: "unmounted" }); view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(invalidate).toHaveBeenCalledTimes(1); client.clear();
});
