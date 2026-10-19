// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { S } from "../../api/types";
import { ApiError } from "../../api/errors";
import { qk } from "../../platform/queryKeys";
import { SessionTeamBoard, TeamBoard } from "./TeamBoard";
import { taskStatusLabels } from "./labels";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../platform/client", () => ({ api: { get } }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" } }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); get.mockReset(); });
it("renders the roster-only early payload without crashing", async () => {
  get.mockResolvedValue({ board: { roster: [{ name: "writer", role: "teammate", status: "idle", description: "writes" }] }, members: [{ name: "writer", role: "teammate", status: "idle", turn: 0 }], finished: false, summary: "" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><TeamBoard runId="r" /></QueryClientProvider>);
  await screen.findByText("writer"); expect(screen.getByText("暂无任务，负责人创建任务后会显示在这里。")).toBeTruthy();
  view.unmount(); client.clear();
});
it("shows a missing active projection as empty rather than a team error", async () => {
  get.mockRejectedValue(new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SessionTeamBoard runId="r" active /></QueryClientProvider>);
  await screen.findByText("暂无任务，负责人创建任务后会显示在这里。");
  expect(screen.queryByText(/读取任务板失败/)).toBeNull();
  view.unmount(); client.clear();
});
it("renders a null board as no board after the run ends", async () => {
  get.mockRejectedValue(new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><TeamBoard runId="r" active /></QueryClientProvider>);
  await screen.findByText("暂无任务，负责人创建任务后会显示在这里。");
  view.rerender(<QueryClientProvider client={client}><TeamBoard runId="r" active={false} /></QueryClientProvider>);
  expect(screen.getByText("没有任务板").className).toContain("text-muted-foreground");
  expect(screen.queryByText(/读取任务板失败/)).toBeNull();
  view.unmount(); client.clear();
});
it("fetches an ended session board only while its panel is open", async () => {
  get.mockRejectedValue(new ApiError(404, { code: "NOT_FOUND", message: "Resource not found", retryable: false }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><SessionTeamBoard runId="r" active={false} /></QueryClientProvider>);
  const panel = screen.getByText("专家团任务板").closest("details")!;
  expect(panel.open).toBe(false); expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("专家团任务板"));
  await screen.findByText("没有任务板");
  expect(get).toHaveBeenCalledWith("/runs/r/team", expect.anything());
  fireEvent.click(screen.getByText("专家团任务板"));
  await waitFor(() => expect(screen.queryByText("没有任务板")).toBeNull());
  const calls = get.mock.calls.length;
  await act(async () => { await client.invalidateQueries({ queryKey: qk.team("t", "r") }); });
  expect(get).toHaveBeenCalledTimes(calls);
  view.rerender(<QueryClientProvider client={client}><SessionTeamBoard runId="r" active /></QueryClientProvider>);
  await screen.findByText("暂无任务，负责人创建任务后会显示在这里。");
  expect(panel.open).toBe(true);
  view.rerender(<QueryClientProvider client={client}><SessionTeamBoard runId="r" active={false} /></QueryClientProvider>);
  expect(panel.open).toBe(false);
  await waitFor(() => expect(screen.queryByText("没有任务板")).toBeNull());
  fireEvent.click(screen.getByText("专家团任务板"));
  await screen.findByText("没有任务板");
  view.unmount(); client.clear();
});
it("contains session panel render failures in an inline alert", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  get.mockResolvedValue({ board: { roster: [], tasks: [{ task_id: "bad", title: "task", status: "pending", deps: 42 }] }, members: [], finished: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><h1>会话内容</h1><SessionTeamBoard runId="r" active /></QueryClientProvider>);
  expect((await screen.findByRole("status")).textContent).toContain("任务板显示失败");
  expect(screen.getByRole("heading", { name: "会话内容" })).toBeTruthy();
  expect(screen.getByText("专家团任务板")).toBeTruthy(); expect(screen.queryByText("页面出错了")).toBeNull();
  view.unmount(); client.clear();
});
it("C6 groups tasks in contract order, displays members and review votes, and only shows the finished summary", async () => {
  const statuses: S["TaskStatus"][] = ["pending", "blocked", "in_progress", "in_review", "completed", "cancelled", "failed"];
  expect(Object.keys(taskStatusLabels)).toEqual(statuses);
  const data: S["TeamView"] = { finished: false, summary: "最终交付", members: [{ name: "writer-1", role: "teammate", status: "working", task_id: "in_progress", turn: 1 }], board: { roster: [], tasks: statuses.map((status) => ({ task_id: status, title: `任务-${status}`, status, deps: ["dep"], attempts: 2, assignee: "writer-1", description: "", narrowed_tools: [], files: [], review: { reviewers: ["reviewer"], votes: [{ reviewer: "reviewer", verdict: "approve", comment: "内容正确" }] } })) } };
  get.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><TeamBoard runId="r" /></QueryClientProvider>);
  await screen.findByText("工作中"); expect(screen.queryByText("最终交付")).toBeNull();
  expect(screen.getAllByTestId("task-lane").map((lane) => lane.getAttribute("data-status"))).toEqual(statuses);
  for (const status of statuses) {
    const lane = screen.getAllByTestId("task-lane").find((lane) => lane.getAttribute("data-status") === status)!;
    expect(within(lane).getByText(`任务-${status}`)).toBeTruthy(); expect(within(lane).getByText("通过")).toBeTruthy(); expect(within(lane).getByText("依赖 1")).toBeTruthy(); expect(within(lane).getByText("尝试 2 次")).toBeTruthy();
  }
  client.setQueryData(["t", "run", "r", "team"], { ...data, finished: true });
  await screen.findByRole("heading", { name: "总结" }); expect(screen.getByText("最终交付")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/runs/r/team", expect.anything());
  view.unmount(); client.clear();
});
