// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { S } from "../../api/types";
import Page from "./Page";
const { state } = vi.hoisted(() => ({ state: { principal: "owner", roles: [] as string[] } }));
const schedule: S["Schedule"] = { id: "s", tenant_id: "t", workspace_id: "w", owner_id: "owner", name: "每天", cron: "0 3 * * *", timezone: "UTC", entry_kind: "agent", entry_ref: "dev/echo", prompt: "https://example.test/very-long-url", budget_millicredits: 1000, overlap_policy: "skip", catchup_window_seconds: 3600, status: "active", version: 1, synced_version: 1, sync_pending: false, created_at: "", updated_at: "" };
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" }, principal: { id: state.principal }, roles: state.roles }) }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w" } }) }));
vi.mock("./api", () => ({ useSchedules: () => ({}), useSchedule: () => ({ data: { schedule, runs: [] } }), deleteSchedule: vi.fn(), patchSchedule: vi.fn(), triggerSchedule: vi.fn() }));
afterEach(cleanup);
it.each([
  ["owner", [], true], ["other", ["tenant.owner"], true], ["other", ["tenant.admin"], true],
  ["other", ["tenant.member"], false], ["other", ["ws.admin"], false], ["other", ["tenant.auditor"], false],
] as const)("gates actions for %s with %j (workspace roles have no scope in the client)", (principal, roles, allowed) => {
  state.principal = principal; state.roles = [...roles];
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Page mode="detail" /></MemoryRouter></QueryClientProvider>);
  for (const name of ["立即运行", "暂停", "删除"]) {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(!allowed);
    if (!allowed) expect(button.title).toContain("无法确认此工作空间的成员管理权限");
  }
  if (allowed) expect(screen.getByRole("link", { name: "编辑" })).toBeTruthy();
  else { expect(screen.queryByRole("link", { name: "编辑" })).toBeNull(); expect((screen.getByRole("button", { name: "编辑" }) as HTMLButtonElement).disabled).toBe(true); }
  expect((screen.getByRole("button", { name: "刷新" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(schedule.prompt).className).toContain("break-words");
});
