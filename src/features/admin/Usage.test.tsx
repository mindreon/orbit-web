// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Usage, UsageResults } from "./Usage";
const { get } = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock("../../platform/client", () => ({ api: { get } }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ roles: ["tenant.member"], principal: { id: "p" }, currentTenant: { id: "t" } }) }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w" }, workspaces: [] }) }));
afterEach(() => { cleanup(); get.mockClear(); });
it("labels UTC dates, blocks invalid ranges without requests, and accepts the 93-day boundary", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Usage /></QueryClientProvider>);
  await waitFor(() => expect(get).toHaveBeenCalledOnce()); get.mockClear();
  const from = screen.getByLabelText("开始日期（UTC）"); const to = screen.getByLabelText("结束日期（UTC）");
  fireEvent.change(from, { target: { value: "" } });
  fireEvent.change(to, { target: { value: "2026-01-01" } });
  fireEvent.change(from, { target: { value: "2026-01-02" } });
  expect(screen.getByText("开始日期不能晚于结束日期")).toBeTruthy();
  fireEvent.change(to, { target: { value: "2026-04-05" } });
  expect(screen.getByText("时间段不能超过 93 天")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
  fireEvent.change(to, { target: { value: "2026-04-04" } });
  await waitFor(() => expect(get).toHaveBeenCalledOnce());
  expect(get.mock.calls[0][1].query).toMatchObject({ from: "2026-01-02T00:00:00Z", to: "2026-04-05T00:00:00Z" });
  get.mockClear(); fireEvent.change(from, { target: { value: "" } });
  expect(screen.getByText("请选择开始和结束日期")).toBeTruthy(); expect(get).not.toHaveBeenCalled();
});
it("formats usage buckets and computed-through timestamps explicitly in UTC", () => {
  render(<UsageResults report={{ scope: "user", from: "2026-10-01T00:00:00Z", to: "2026-10-20T00:00:00Z", granularity: "hour", computed_through: "2026-10-19T23:00:00Z", dirty_hours: 0, items: [{ period_start: "2026-10-19T23:00:00Z", quantity: "1", millicredits: 1000 }] }} />);
  expect(screen.getByText("2026/10/19 23:00:00 UTC")).toBeTruthy();
  expect(screen.getByText("已计算至 2026/10/19 23:00:00 UTC")).toBeTruthy();
});
