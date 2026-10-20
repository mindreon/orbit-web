// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Asset, S } from "../../api/types";
import VersionDetail, { VersionRefs, VersionActions } from "./VersionDetail";
import AssetCenter from "./Center";
import { GrantsTab, InstallsTab } from "./ManagementTabs";
import { DependentsTab } from "./DependentsTab";
import { DetailContent } from "./Detail";
const { get, post, del, useDependents, useAssetList, useAssetScopeList, useAssets, identity, workspace, changeGrant, installAsset } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), useDependents: vi.fn(), useAssetList: vi.fn(), useAssetScopeList: vi.fn(), useAssets: vi.fn(), identity: { currentTenant: { id: "tenant" }, principal: { id: "owner" }, roles: ["tenant.owner"] as string[] }, workspace: { current: { id: "ws", name: "空间" }, workspaces: [{ id: "ws", name: "空间" }, { id: "ws2", name: "第二空间" }] }, changeGrant: vi.fn(), installAsset: vi.fn() }));
vi.mock("../../platform/client", () => ({ api: { get, post, delete: del } }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => identity }));
vi.mock("../../platform/tenancy/WorkspaceProvider", () => ({ useWorkspace: () => workspace }));
vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), useDependents, useAssetList, useAssetScopeList, useAssets, changeGrant, installAsset }));
afterEach(() => { cleanup(); vi.clearAllMocks(); identity.roles = ["tenant.owner"]; vi.useRealTimers(); });
const asset = { id: "asset", name: "search", display_name: "检索", publisher: "dev", owner_id: "owner", kind: "skill", visibility: "tenant", status: "active" } as Asset;
const emptyQuery = () => ({ data: { pages: [{ items: [] }] }, isPending: false, error: null, hasNextPage: false });
function mount(element: React.ReactNode, path = "/") { const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>); }
beforeEach(() => { changeGrant.mockResolvedValue({}); useAssetList.mockReturnValue(emptyQuery()); });
it("C10 resolves catalog and MCP refs by kind, keeps unresolved refs and does not link direct MCP", async () => {
  get.mockImplementation((_path: string, options: { query: { ref: string } }) => Promise.resolve({ items: options.query.ref === "dev/missing" ? [] : [{ ...asset, id: options.query.ref === "dev/search" ? "skill" : "mcp" }] }));
  mount(<VersionRefs manifest={{ skills: { skills: [{ name: "search", source: "catalog", id: "dev/search", version: "^1" }, { name: "local", source: "bundle" }, { name: "missing", source: "catalog", id: "dev/missing" }] }, mcp: { mcpServers: { lookup: { ref: "dev/mcp@^2", args: [] }, remote: { url: "https://user:secret@example.test/path?token=hidden", args: [] }, command: { command: "secret-command", args: [] } } } }} />);
  await waitFor(() => expect(screen.getByRole("link", { name: "dev/search" }).getAttribute("href")).toBe("/assets/skill"));
  expect(screen.getByRole("link", { name: "dev/mcp" }).getAttribute("href")).toBe("/assets/mcp");
  expect(screen.getByText("无权查看或不存在")).toBeTruthy(); expect(screen.getByText("随专家打包")).toBeTruthy();
  expect(screen.getByText("example.test").closest("a")).toBeNull(); expect(document.body.textContent).not.toContain("hidden"); expect(document.body.textContent).not.toContain("secret-command");
  expect(get).toHaveBeenCalledWith("/assets", expect.objectContaining({ query: { ref: "dev/search", kind: "skill" } }));
  expect(get).toHaveBeenCalledWith("/assets", expect.objectContaining({ query: { ref: "dev/mcp", kind: "mcp_server" } }));
});
it("C10 dependents show expert and referencing version states", () => {
  useDependents.mockReturnValue({ ...emptyQuery(), data: { pages: [{ items: [{ asset: { ...asset, id: "expert", display_name: "研究专家" }, versions: [{ id: "v", version: "1.0.2", state: "draft" }] }] }] } });
  mount(<DependentsTab asset={asset} />); expect(screen.getByRole("link", { name: "研究专家" }).getAttribute("href")).toBe("/assets/expert"); expect(screen.getByText("1.0.2（草稿）")).toBeTruthy(); expect(useDependents).toHaveBeenCalledWith("asset");
});
it.each(["agent", "team", "skill", "mcp_server"] as const)("detail gates dependent tab for %s", (kind) => {
  useAssetList.mockReturnValue(emptyQuery()); mount(<DetailContent asset={{ ...asset, kind }} />);
  expect(Boolean(screen.queryByRole("tab", { name: "被哪些专家使用" }))).toBe(kind === "skill" || kind === "mcp_server");
  expect(screen.getAllByRole("tab").map((t) => t.textContent).slice(0, 4)).toEqual(["版本", "通道", "共享", "安装"]);
});
it("non-reviewers can only yank suspended versions", () => {
  identity.roles = ["tenant.member"];
  mount(<VersionActions asset={asset} version={{ id: "v", state: "suspended" } as S["AssetVersion"]} />);
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["下架"]);
});
it("tenant grants hide grantee ID and submit the current tenant ID", async () => {
  useAssetList.mockReturnValue(emptyQuery());
  mount(<GrantsTab asset={asset} />); fireEvent.click(screen.getByRole("button", { name: "添加共享" }));
  fireEvent.change(screen.getByLabelText("对象类型"), { target: { value: "tenant" } });
  expect(screen.queryByLabelText("对象 ID")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "添加共享" }));
  await waitFor(() => expect(changeGrant).toHaveBeenCalledWith("asset", { grantee_type: "tenant", grantee_id: "tenant", permission: "use" }, false, expect.any(String)));
});
it("workspace grants select an available workspace and submit its ID", async () => {
  useAssetList.mockReturnValue(emptyQuery()); mount(<GrantsTab asset={asset} />); fireEvent.click(screen.getByRole("button", { name: "添加共享" }));
  fireEvent.change(screen.getByLabelText("对象类型"), { target: { value: "workspace" } });
  const id = screen.getByLabelText("对象 ID") as HTMLSelectElement;
  expect(id.tagName).toBe("SELECT"); fireEvent.change(id, { target: { value: "ws2" } });
  fireEvent.click(screen.getByRole("button", { name: "添加共享" }));
  await waitFor(() => expect(changeGrant).toHaveBeenCalledWith("asset", { grantee_type: "workspace", grantee_id: "ws2", permission: "use" }, false, expect.any(String)));
});
it("install lists do not claim absence before all pages have loaded", () => {
  useAssetScopeList.mockReturnValue({ ...emptyQuery(), hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  mount(<InstallsTab asset={asset} />);
  expect(screen.queryByText("此范围还没有安装此资产")).toBeNull(); expect(screen.getAllByRole("button", { name: "加载更多" })).toHaveLength(2);
});
it("approved versions continue polling until published", async () => {
  vi.useFakeTimers();
  const version = { id: "v", version: "1.0.0", state: "approved", manifest: {}, permissions: {} } as S["AssetVersion"];
  let state = "approved";
  get.mockImplementation((path: string) => Promise.resolve(path.includes("/versions/") ? { ...version, state } : asset));
  mount(<Routes><Route path="/assets/:assetId/versions/:versionId" element={<VersionDetail />} /></Routes>, "/assets/asset/versions/v");
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText("版本 1.0.0")).toBeTruthy(); state = "published";
  await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
  expect(get.mock.calls.filter(([path]) => path === "/assets/asset/versions/v")).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
  expect(get.mock.calls.filter(([path]) => path === "/assets/asset/versions/v")).toHaveLength(2);
});
it.each([["版本约束", "^2"], ["安装范围", "tenant"], ["通道", "beta"]])("install form resets success when %s changes", async (label, value) => {
  installAsset.mockResolvedValue({}); useAssetList.mockReturnValue(emptyQuery()); useAssetScopeList.mockReturnValue({ ...emptyQuery(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  mount(<InstallsTab asset={asset} />); fireEvent.click(screen.getByRole("button", { name: "安装" })); await waitFor(() => expect(screen.getByText("已安装")).toBeTruthy());
  fireEvent.change(screen.getByLabelText(label), { target: { value } }); expect(screen.queryByText("已安装")).toBeNull();
});
it("asset queries retain previous pages while new filters load", async () => {
  const { useAssets: actualUseAssets } = await vi.importActual<typeof import("./api")>("./api");
  get.mockImplementation((_path: string, options: { query: { q?: string } }) => options.query.q ? new Promise(() => {}) : Promise.resolve({ items: [asset] }));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderHook(({ q }: { q?: string }) => actualUseAssets({ q }), { initialProps: {} as { q?: string }, wrapper: ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> });
  await waitFor(() => expect(view.result.current.data?.pages[0].items).toEqual([asset]));
  view.rerender({ q: "search" });
  expect(view.result.current.isPending).toBe(false); expect(view.result.current.data?.pages[0].items).toEqual([asset]);
});
it("search keeps showing existing assets while the debounced filter waits", async () => {
  vi.useFakeTimers(); useAssets.mockReturnValue({ data: { pages: [{ items: [asset] }] }, isPending: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  mount(<AssetCenter />);
  fireEvent.change(screen.getByLabelText("搜索资产"), { target: { value: "abc" } });
  expect(useAssets).toHaveBeenLastCalledWith({});
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(useAssets).toHaveBeenLastCalledWith({ q: "abc" });
});
it("transitions explain consequences and send nothing until confirmed", async () => {
  post.mockResolvedValue({}); mount(<VersionActions asset={asset} version={{ id: "v", state: "published" } as S["AssetVersion"]} />);
  fireEvent.click(screen.getByRole("button", { name: "停用" })); expect(post).not.toHaveBeenCalled(); expect(screen.getByText(/不能用于新的运行/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "确认" })); await waitFor(() => expect(post).toHaveBeenCalledWith("/assets/asset/versions/v:transition", { state: "suspended" }, expect.objectContaining({ idempotencyKey: expect.any(String) })));
});
