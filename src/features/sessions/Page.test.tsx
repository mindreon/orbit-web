// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { qk } from "../../platform/queryKeys";
import SessionsHome from "./Page";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" } }) }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w" }, workspaces: [{ id: "w", name: "dev" }] }) }));
vi.mock("./api", () => ({ useRecentSessions: () => ({ data: { pages: [{ items: [] }] } }), useEntries: () => ({ data: [{ id: "a", kind: "agent", publisher: "dev", name: "echo" }] }), createSession: create }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("invalidates tenant session lists after creation and navigates to the new session", async () => {
  create.mockResolvedValue({ id: "new" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/sessions?new=agent:dev/echo"]}><Routes><Route path="/sessions" element={<SessionsHome />} /><Route path="/sessions/:sessionId" element={<p>New session</p>} /></Routes></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "创建会话" }));
  await waitFor(() => expect(screen.getByText("New session")).toBeTruthy());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.sessionLists("t") });
  client.clear();
});
