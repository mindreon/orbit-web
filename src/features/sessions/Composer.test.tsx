// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Composer } from "./Composer";
afterEach(cleanup);
it("C3 Enter sends, Shift+Enter does not; retry reuses intent, editing and success replace it", async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ disposition: "started" });
  render(<Composer onSend={send} />);
  const field = screen.getByRole("textbox", { name: "消息" });
  fireEvent.change(field, { target: { value: "hello" } }); fireEvent.keyDown(field, { key: "Enter", shiftKey: true }); expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: "Enter" }); await screen.findByText(/offline/);
  fireEvent.keyDown(field, { key: "Enter" }); await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1]);
  await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(""));
  fireEvent.change(field, { target: { value: "hello" } }); fireEvent.keyDown(field, { key: "Enter" });
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3)); expect(send.mock.calls[2][1]).not.toBe(send.mock.calls[0][1]);
  expect(screen.queryByRole("button", { name: /附件|上传/ })).toBeNull();
});
it.each([["queued", "已排队（第 3 位）"], ["steered", "已插入当前运行"], ["started", null]] as const)("C3 disposition %s", async (disposition, text) => {
  render(<Composer onSend={vi.fn().mockResolvedValue({ disposition, position: 3 })} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } }); fireEvent.click(screen.getByRole("button", { name: "发送" }));
  if (text) expect(await screen.findByText(text)).toBeTruthy(); else await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(""));
});
it("C3 active run offers stop and pause; archived session is read-only", () => {
  const stop = vi.fn(), pause = vi.fn();
  const view = render(<Composer active status="running" onSend={vi.fn()} onStop={stop} onPause={pause} />);
  fireEvent.click(screen.getByRole("button", { name: "停止" })); fireEvent.click(screen.getByRole("button", { name: "暂停" }));
  expect(stop).toHaveBeenCalledOnce(); expect(pause).toHaveBeenCalledOnce();
  view.rerender(<Composer archived onSend={vi.fn()} />); expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true);
});

it.each(["running", "paused"])("lets pointer users queue or steer messages while %s and keeps pause/resume available", async (status) => {
  const send = vi.fn().mockResolvedValue({ disposition: status === "paused" ? "steered" : "queued", position: 2 });
  render(<Composer active status={status} onSend={send} />);
  expect(screen.getByRole("button", { name: "停止" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "next" } });
  expect(screen.getByRole("button", { name: status === "paused" ? "继续" : "暂停" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "停止" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  expect(await screen.findByText(status === "paused" ? "已插入当前运行" : "已排队（第 2 位）")).toBeTruthy();
  expect(send).toHaveBeenCalledWith("next", expect.any(String));
  expect(screen.getByRole("button", { name: "停止" })).toBeTruthy();
});
