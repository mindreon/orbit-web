// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { S } from "../../api/types";
import { OneTimeSecret } from "./APIKeys";
import { nextDayStart, UsageResults } from "./Usage";
import { canOpenAdmin, visibleAdminTabs } from "./access";
import { memberSourceLabels, memberStatusLabels, tenantRoleLabels, workspaceRoleLabels } from "./labels";
afterEach(cleanup);
it("U5 member and workspace role tables match enums and stay Chinese", () => {
  const roles: S["TenantRole"][] = ["tenant.owner", "tenant.admin", "tenant.auditor", "tenant.reviewer", "tenant.member"];
  expect(Object.keys(tenantRoleLabels).sort()).toEqual(roles.sort()); expect(Object.keys(workspaceRoleLabels).sort()).toEqual(["ws.admin", "ws.editor", "ws.member", "ws.viewer"]);
  expect(Object.keys(memberStatusLabels).sort()).toEqual(["active", "invited", "suspended"]); expect(Object.keys(memberSourceLabels).sort()).toEqual(["direct", "invite", "jit", "scim"]);
  expect(tenantRoleLabels["tenant.reviewer"]).toBe("审核员");
});
it("gates all admin tabs including direct routes and auditor access", () => {
  expect(visibleAdminTabs(["tenant.member", "ws.admin"])).toEqual([]); expect(visibleAdminTabs(["tenant.reviewer"])).toEqual([]);
  expect(visibleAdminTabs(["tenant.auditor"]).map(([key]) => key)).toEqual(["audit"]);
  for (const role of ["tenant.admin", "tenant.owner"]) expect(visibleAdminTabs([role])).toHaveLength(8);
  expect(canOpenAdmin(["tenant.auditor"], "models")).toBe(false);
});
it("one-time secret is copyable and removed when acknowledged without a persisted copy", async () => {
  const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const close = vi.fn(); const view = render(<OneTimeSecret secret="test-only-one-time-key" onClose={close} />);
  expect(screen.getByText("关闭后无法再次查看")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "复制密钥" })); expect(copy).toHaveBeenCalledWith("test-only-one-time-key");
  expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" }); fireEvent.click(document.body);
  expect(close).not.toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "我已保存" })); expect(close).toHaveBeenCalledOnce(); view.unmount(); expect(screen.queryByText("test-only-one-time-key")).toBeNull();
});
it("usage labels null quantity without summing units and draws max-normalized cost bars", () => {
  const report: S["UsageReport"] = { scope: "user", from: "2026-10-01T00:00:00Z", to: "2026-10-20T00:00:00Z", granularity: "day", computed_through: "2026-10-19T00:00:00Z", dirty_hours: 2, items: [{ period_start: "2026-10-19T00:00:00Z", quantity: null, millicredits: 2000 }, { period_start: "2026-10-20T00:00:00Z", quantity: "100", millicredits: 1000 }] };
  const view = render(<UsageResults report={report} />);
  expect(screen.getByText("跨计量单位不可相加")).toBeTruthy(); expect(screen.getByText(/2 个小时/)).toBeTruthy(); expect(screen.getByText(/已计算至/)).toBeTruthy();
  expect(screen.getAllByTestId("usage-bar").map((bar) => bar.style.width)).toEqual(["100%", "50%"]);
  view.rerender(<UsageResults report={{ ...report, dirty_hours: 0, items: [{ ...report.items[0], millicredits: 0 }] }} />); expect(screen.getByTestId("usage-bar").style.width).toBe("0%");
});
it("ends a usage range at the next whole UTC hour after the inclusive end date", () => {
  expect(nextDayStart("2026-10-19")).toBe("2026-10-20T00:00:00Z");
  expect(nextDayStart("2026-12-31")).toBe("2027-01-01T00:00:00Z");
});
