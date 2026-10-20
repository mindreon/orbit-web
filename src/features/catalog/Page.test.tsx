// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import CatalogPage from "./Page";
import { catalogItems } from "./catalogItems";
import type { Asset } from "../../api/types";
const { useCatalog } = vi.hoisted(() => ({ useCatalog: vi.fn() }));
vi.mock("./api", () => ({ useCatalog }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ roles: ["tenant.member"] }) }));
import * as permissions from "../../platform/permissions";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("C11 installed entries have a chip and come first; every entry starts a conversation", () => {
  useCatalog.mockReturnValue({ data: { items: catalogItems([{ id: "a", name: "alpha", publisher: "dev", kind: "agent", status: "active" }, { id: "z", name: "zeta", publisher: "dev", kind: "agent", status: "active", display_name: "专家 Z", description: "说明" }] as Asset[], [{ asset_id: "z" }], []) } });
  render(<MemoryRouter><CatalogPage kind="agent" /></MemoryRouter>);
  expect(screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent)).toEqual(["专家 Z", "alpha"]);
  expect(screen.getByText("已安装")).toBeTruthy(); expect(screen.getByText("说明")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "开始对话" }).map((el) => el.getAttribute("href"))).toEqual(["/sessions?new=agent:dev/zeta", "/sessions?new=agent:dev/alpha"]);
});
it("C11 empty catalog uses the kind-specific sentence", () => {
  useCatalog.mockReturnValue({ data: { items: [] } }); render(<MemoryRouter><CatalogPage kind="team" /></MemoryRouter>);
  expect(screen.getByText("还没有可用的专家团")).toBeTruthy();
});

it.each([["private", "私有"], ["workspace", "工作空间"], ["tenant", "全员可见"]] as const)("labels %s visibility next to the asset name", (visibility, label) => {
  useCatalog.mockReturnValue({ data: { items: [{ asset: { id: "a", name: "alpha", publisher: "dev", visibility }, installed: false }] } });
  render(<MemoryRouter><CatalogPage kind="agent" /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 2 }).parentElement?.contains(screen.getByText(label))).toBe(true);
});
it.each([true, false])("empty catalog offers creation only when assets navigation is permitted (%s)", (allowed) => {
  const permission = vi.spyOn(permissions, "canNavigate").mockReturnValue(allowed);
  useCatalog.mockReturnValue({ data: { items: [] } });
  render(<MemoryRouter><CatalogPage kind="agent" /></MemoryRouter>);
  const link = screen.queryByRole("link", { name: "去资产中心创建" });
  expect(link?.getAttribute("href") ?? null).toBe(allowed ? "/assets" : null);
  expect(permission).toHaveBeenCalledWith(["tenant.member"], "assets");
});
