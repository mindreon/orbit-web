// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { emptyRunStream, reduceRunEvent, type RunEventLike } from "../../api/timeline";
import { Timeline } from "./Timeline";
afterEach(cleanup);
it.each(["cancelled", "failed", "timed_out", "budget_exhausted", "succeeded"] as const)("marks a result-less tool unfinished when the stream is %s", (status) => {
  const called = reduceRunEvent(emptyRunStream, { id: "r:main:1:0:1", member: "main", segment: 1, attempt: 0, type: "tool.call", data: { call_id: "c", tool: "wait_seconds", args_preview: "240", effect_class: "read" } });
  const props = { interactions: [], principalId: "me", onResolve: vi.fn() };
  const view = render(<Timeline {...props} state={called} />);
  expect(screen.getByLabelText("运行中")).toBeTruthy();
  view.rerender(<Timeline {...props} state={{ ...called, status }} />);
  expect(screen.queryByLabelText("运行中")).toBeNull();
  expect(screen.getByLabelText("未完成").getAttribute("class")).toContain("text-muted-foreground");
  expect(screen.queryByText("失败")).toBeNull();
});
it.each([true, false])("preserves a completed tool result (ok=%s) in a terminal run", (ok) => {
  const called = reduceRunEvent(emptyRunStream, { id: "r:main:1:0:1", member: "main", segment: 1, attempt: 0, type: "tool.call", data: { call_id: "c", tool: "wait_seconds", args_preview: "{}", effect_class: "read" } });
  const result = reduceRunEvent(called, { id: "r:main:1:0:2", member: "main", segment: 1, attempt: 0, type: "tool.result", data: { call_id: "c", ok, preview: "done" } });
  render(<Timeline state={{ ...result, status: "cancelled" }} interactions={[]} principalId="me" onResolve={vi.fn()} />);
  expect(screen.queryByLabelText("运行中")).toBeNull();
  expect(screen.queryByLabelText("未完成")).toBeNull();
  expect(ok ? screen.getByLabelText("成功") : screen.getByText("失败")).toBeTruthy();
});
it("C4 real timeline renders cursor, collapsed reasoning, tool and member message; model HTML stays inert", () => {
  const state = [
    ["message.delta", { message_id: "m", delta: '<img src=x onerror="window.xss=1">hello' }],
    ["reasoning.delta", { message_id: "m", delta: "private thought" }],
    ["tool.call", { call_id: "c", tool: "wait_seconds", args_preview: "{}", effect_class: "read" }],
    ["team.message", { message_id: "tm", from: "A", to: "B", text: "body" }],
  ].reduce((s, [type, data], i) => reduceRunEvent(s, { id: `r:main:1:0:${i + 1}`, member: "main", segment: 1, attempt: 0, type, data } as RunEventLike), emptyRunStream);
  const { container } = render(<MemoryRouter><Timeline state={state} interactions={[]} principalId="me" onResolve={vi.fn()} /></MemoryRouter>);
  expect(screen.getByLabelText("正在生成")).toBeTruthy();
  expect(screen.getByText("思考过程").closest("details")?.open).toBe(false);
  fireEvent.click(screen.getByText("思考过程")); expect(screen.getByText("private thought")).toBeTruthy();
  expect(screen.getByText("wait_seconds")).toBeTruthy(); expect(screen.getByText("A → B")).toBeTruthy();
  expect(container.querySelector("[onerror]")).toBeNull(); expect((window as unknown as { xss?: number }).xss).toBeUndefined();
});
it("does not render an orphan tool result, but pairs it when its call arrives", () => {
  const result = reduceRunEvent(emptyRunStream, { id: "r:main:1:0:1", member: "main", segment: 1, attempt: 0, type: "tool.result", data: { call_id: "c", ok: false, preview: "null" } });
  const props = { interactions: [], principalId: "me", onResolve: vi.fn() };
  const view = render(<Timeline {...props} state={result} />);
  expect(screen.queryByText("失败")).toBeNull();
  expect(screen.queryByText("工具调用")).toBeNull();
  expect(view.container.querySelector("details")).toBeNull();
  const paired = reduceRunEvent(result, { id: "r:main:1:0:2", member: "main", segment: 1, attempt: 0, type: "tool.call", data: { call_id: "c", tool: "mcp_notify_notify_send", args_preview: "{}", effect_class: "external_write" } });
  view.rerender(<Timeline {...props} state={paired} />);
  expect(screen.getByText("mcp_notify_notify_send")).toBeTruthy();
  expect(screen.queryByText("失败")).toBeNull();
  const failed = reduceRunEvent(paired, { id: "r:main:1:0:3", member: "main", segment: 1, attempt: 0, type: "tool.result", data: { call_id: "c", ok: false, preview: "denied" } });
  view.rerender(<Timeline {...props} state={failed} />);
  expect(screen.getByText("失败")).toBeTruthy();
  expect(view.container.querySelectorAll("details")).toHaveLength(1);
});
