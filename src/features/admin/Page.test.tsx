// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { FormDialog, useAdminWrite } from "./shared";
import { Field, Input } from "../../ui/fields";
import Page from "./Page";
const { state, patch } = vi.hoisted(() => ({ state: { roles: ["tenant.member"], memberError: false, memberRoles: ["tenant.owner"] }, patch: vi.fn() }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ roles: state.roles, currentTenant: { id: "t" }, principal: { id: "p" } }) }));
vi.mock("../../platform/client", () => ({ api: {
  get: async (path: string) => {
    if (path === "/admin/members") {
      if (state.memberError) throw new ApiError(403, { code: "FORBIDDEN", message: "forbidden", retryable: false });
      return { items: [{ id: "m", principal: { id: "p", email: "person@example.test", display_name: "用户" }, roles: state.memberRoles, status: "active", source: "jit" }], next_cursor: "" };
    }
    if (path === "/workspaces/w") return { id: "w", name: "工作空间", default_agent_ref: null };
    return { items: [], next_cursor: "" };
  }, patch,
} }));
afterEach(() => { cleanup(); patch.mockReset(); state.memberError = false; state.memberRoles = ["tenant.owner"]; });
function mount(tab: string) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/admin/workspaces/w"]}><Routes><Route path="/admin/workspaces/:workspaceId" element={<Page tab={tab} />} /></Routes></MemoryRouter></QueryClientProvider>); }
it("puts server field details next to the admin field and focuses it", async () => {
  render(<FormDialog title="创建" onClose={vi.fn()} onSubmit={vi.fn()} busy={false} error={new ApiError(422, { code: "INVALID_INPUT", message: "invalid", retryable: false, details: { field: "name", message: "名称不能重复" } })}><Field label="名称"><Input name="name" /></Field></FormDialog>);
  expect(screen.getByText("名称不能重复")).toBeTruthy(); await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("名称")));
});
it("direct admin URL does not mount member UI for an ordinary member", () => {
  state.roles = ["tenant.member"]; mount("members"); expect(screen.getByText("没有权限查看此页面")).toBeTruthy(); expect(screen.queryByLabelText("按邮箱或显示名过滤")).toBeNull();
});
it("uses account-ID input without member.read on a direct workspace resource", async () => {
  state.roles = ["tenant.member"]; mount("workspace-detail");
  fireEvent.click(screen.getByRole("button", { name: "添加工作空间成员" }));
  expect(screen.getByRole("textbox", { name: "账号 ID" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "编辑者 · ws.editor" })).toBeTruthy();
});
it("filters members, has no add-member dialog, and surfaces LAST_OWNER", async () => {
  state.roles = ["tenant.owner"]; patch.mockRejectedValue(new ApiError(409, { code: "LAST_OWNER", message: "last owner", retryable: false })); mount("members");
  expect(await screen.findByText("person@example.test")).toBeTruthy(); expect(screen.queryByRole("button", { name: "添加成员" })).toBeNull();
  fireEvent.change(screen.getByLabelText("按邮箱或显示名过滤"), { target: { value: "not-present" } }); expect(screen.queryByText("person@example.test")).toBeNull();
  fireEvent.change(screen.getByLabelText("按邮箱或显示名过滤"), { target: { value: "person@" } });
  fireEvent.pointerDown(screen.getByRole("button", { name: "person@example.test操作" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "改角色" }));
  fireEvent.change(screen.getByLabelText("角色"), { target: { value: "tenant.member" } }); fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByText(/不能移除最后一位所有者/)).toBeTruthy();
});

it("disables an unchanged single role but warns before replacing multiple tenant roles", async () => {
  state.roles = ["tenant.owner"]; mount("members");
  await screen.findByText("person@example.test");
  fireEvent.pointerDown(screen.getByRole("button", { name: "person@example.test操作" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "改角色" }));
  expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!); expect(patch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("角色"), { target: { value: "tenant.admin" } });
  expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(false);
  cleanup(); state.memberRoles = ["tenant.owner", "tenant.auditor"]; mount("members");
  await screen.findByText("person@example.test");
  fireEvent.pointerDown(screen.getByRole("button", { name: "person@example.test操作" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "改角色" }));
  expect(screen.getByText("该成员当前有多个角色，保存后只保留所选角色").className).toContain("text-warning-700");
  expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(false);
});
it.each(["workspaces", "workspace-members:w"])("invalidates workspace detail and lists after %s writes", async (resource) => {
  state.roles = ["tenant.owner"]; const client = new QueryClient();
  const detail = ["t", "admin", "workspace:w"]; const list = ["t", "workspaces"];
  client.setQueryData(detail, { name: "old" }); client.setQueryData(list, []);
  function Write() { const write = useAdminWrite(resource, {}); return <button onClick={() => void write.run(async () => ({}))}>write</button>; }
  render(<QueryClientProvider client={client}><Write /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "write" }));
  await waitFor(() => expect(client.getQueryState(detail)?.isInvalidated).toBe(true));
  expect(client.getQueryState(list)?.isInvalidated).toBe(true);
});
