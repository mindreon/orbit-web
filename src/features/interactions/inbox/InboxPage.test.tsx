// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { InboxSourceContext } from "./context";
import InboxPage from "./InboxPage";
import type { InboxSource } from "./inboxSource";
vi.mock("../../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" }, principal: { id: "me" } }) }));
afterEach(cleanup);
it.each([false, true])("C9 one pending list; resolution removes it, including handled conflict %s", async (conflict) => {
  const source: InboxSource = { listPending: vi.fn().mockResolvedValue([{ id: "i", kind: "tool_approval", member: "main", sessionId: "s", runId: "r", request: { kind: "tool_approval", interaction_id: "local" }, expiresAt: "2099-01-01", approvers: ["me"] }]), resolve: conflict ? vi.fn().mockRejectedValue({ alreadyHandled: true }) : vi.fn().mockResolvedValue(undefined) };
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InboxSourceContext.Provider value={source}><InboxPage /></InboxSourceContext.Provider></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "允许一次" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "允许一次" })).toBeNull());
  expect(screen.getByText("没有待你处理的事项")).toBeTruthy();
  expect(screen.queryByRole("tab")).toBeNull(); expect(screen.queryByRole("combobox")).toBeNull(); expect(screen.queryByRole("textbox")).toBeNull();
  if (conflict) expect(screen.getByText("已被其他审批人处理")).toBeTruthy();
});
