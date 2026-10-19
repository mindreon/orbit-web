// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { NewSessionDialog } from "./NewSessionDialog";
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" } }) }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w" }, workspaces: [{ id: "w", name: "dev" }] }) }));
const { create, entries } = vi.hoisted(() => ({ create: vi.fn(), entries: [{ id: "a", kind: "agent", publisher: "dev", name: "echo-agent" }, { id: "b", kind: "team", publisher: "dev", name: "review-team" }] }));
vi.mock("./api", () => ({ useEntries: () => ({ data: entries }), createSession: create }));
afterEach(cleanup);
it("C5 groups entries in Chinese and locks a URL-preselected team; ambiguous errors reveal type selection", async () => {
  create.mockRejectedValue(new ApiError(422, { code: "ENTRY_KIND_AMBIGUOUS", message: "ambiguous", retryable: false }));
  render(<MemoryRouter initialEntries={["/sessions?new=team:dev/review-team"]}><NewSessionDialog onClose={vi.fn()} onCreated={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole("group", { name: "专家" })).toBeTruthy(); expect(screen.getByRole("group", { name: "专家团" })).toBeTruthy();
  expect((screen.getByLabelText("入口") as HTMLSelectElement).value).toBe("team:dev/review-team");
  expect((screen.getByLabelText("入口类型") as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "创建会话" }));
  await waitFor(() => expect(screen.getByText(/同名的专家与专家团/)).toBeTruthy());
  expect((screen.getByLabelText("入口类型") as HTMLSelectElement).disabled).toBe(false);
});
