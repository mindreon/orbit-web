// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { ScheduleForm } from "./ScheduleForm";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./api", () => ({ createSchedule: create, patchSchedule: vi.fn() }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" } }) }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => ({ current: { id: "w" } }) }));
vi.mock("../../platform/entries", () => ({ useEntries: () => ({ data: [{ id: "a", kind: "agent", publisher: "dev", name: "echo-agent" }, { id: "b", kind: "team", publisher: "dev", name: "review-team" }] }) }));
afterEach(cleanup);
it("keeps server cron error beside and focuses its field, preserves retry key until inputs change", async () => {
  create.mockRejectedValue(new ApiError(422, { code: "SCHEDULE_INTERVAL_TOO_SHORT", message: "too short", retryable: false }));
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ScheduleForm /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "每天" } }); fireEvent.change(screen.getByLabelText("入口"), { target: { value: "agent:dev/echo-agent" } }); fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "ready" } }); fireEvent.change(screen.getByLabelText("cron"), { target: { value: "*/1 * * * *" } });
  fireEvent.click(screen.getByRole("button", { name: "创建定时任务" }));
  expect(await screen.findByText("触发间隔不能短于 5 分钟")).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("cron")));
  expect(create.mock.calls[0][0].budget_millicredits).toBe(100000);
  fireEvent.click(screen.getByRole("button", { name: "创建定时任务" })); await waitFor(() => expect(create).toHaveBeenCalledTimes(2)); expect(create.mock.calls[0][1]).toBe(create.mock.calls[1][1]);
  fireEvent.change(screen.getByLabelText("cron"), { target: { value: "0 3 * * *" } }); fireEvent.click(screen.getByRole("button", { name: "创建定时任务" })); await waitFor(() => expect(create).toHaveBeenCalledTimes(3)); expect(create.mock.calls[2][1]).not.toBe(create.mock.calls[1][1]);
});
