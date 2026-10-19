// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { InteractionRequest } from "../../api/types";
import { ApprovalCard, AskUserCard, EffectCard } from "./Cards";
afterEach(cleanup);
const request: InteractionRequest = { interaction_id: "i", kind: "tool_approval", calls: [{ name: "notify", call_id: "c", args_preview: "{}", effect_class: "external_write", risk_reasons: ["外部写入"] }] };
const props = { request, approvers: ["me"], principalId: "me", expiresAt: "2099-01-01T00:00:00Z" };
it.each([["允许一次", "allow_once"], ["本会话允许", "allow_session"]])("C1 %s has the contract shape and collapses after resolution", async (label, choice) => {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  render(<ApprovalCard {...props} onResolve={onResolve} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ kind: "tool_approval", choice }));
  expect(await screen.findByText(new RegExp(`已由 你.*处理：${label}`))).toBeTruthy();
});
it("C1 persistent grants expand inline with scope/pattern, denial has a comment", async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  const view = render(<ApprovalCard {...props} onResolve={onResolve} />);
  fireEvent.click(screen.getByRole("button", { name: "始终允许…" }));
  fireEvent.change(screen.getByLabelText("范围"), { target: { value: "workspace" } });
  fireEvent.change(screen.getByLabelText("参数模式"), { target: { value: "abc*" } });
  fireEvent.click(screen.getByRole("button", { name: "确认始终允许" }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ kind: "tool_approval", choice: "allow_always", scope: "workspace", arg_pattern: "abc*" }));
  view.unmount(); render(<ApprovalCard {...props} onResolve={onResolve} />);
  fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
  fireEvent.change(screen.getByLabelText("拒绝说明"), { target: { value: "不需要" } });
  fireEvent.click(screen.getByRole("button", { name: "确认拒绝" }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ kind: "tool_approval", choice: "deny", comment: "不需要" }));
});
it("C1 non-approvers and expired items cannot decide", () => {
  const view = render(<ApprovalCard {...props} principalId="other" onResolve={vi.fn()} />);
  expect(screen.getByText("等待审批")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
  view.unmount(); render(<ApprovalCard {...props} expiresAt="2000-01-01" onResolve={vi.fn()} />);
  expect(screen.getByText("已过期")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
});
it("C2 suggested answers fill the field and ask_user submits a free answer", async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  render(<AskUserCard {...props} request={{ kind: "ask_user", interaction_id: "q", question: { text: "选择？", options: ["建议"] } }} onResolve={onResolve} />);
  expect(screen.getByRole("button", { name: "建议" }).className).toContain("min-h-11");
  expect(screen.getByRole("button", { name: "建议" }).className).toContain("sm:min-h-0");
  fireEvent.click(screen.getByRole("button", { name: "建议" }));
  expect((screen.getByLabelText("回答") as HTMLTextAreaElement).value).toBe("建议");
  fireEvent.change(screen.getByLabelText("回答"), { target: { value: "自定义" } });
  fireEvent.click(screen.getByRole("button", { name: "提交回答" }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ kind: "ask_user", answer: "自定义" }));
});
it.each([["视为已完成", "treat_as_done"], ["重试", "retry"], ["放弃", "abandon"]])("C2 effect %s", async (label, choice) => {
  const onResolve = vi.fn().mockResolvedValue(undefined);
  render(<EffectCard {...props} request={{ kind: "effect_uncertain", interaction_id: "e", effect: { effect_key: "key", tool: "notify", args_preview: "{}" } }} onResolve={onResolve} />);
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ kind: "effect_uncertain", choice }));
});
