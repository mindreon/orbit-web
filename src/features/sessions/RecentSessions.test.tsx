// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RecentSessions } from "./RecentSessions";
const { recent } = vi.hoisted(() => ({ recent: vi.fn() }));
vi.mock("./api", () => ({ useRecentSessions: recent }));
vi.mock("../../platform/identity", () => ({ useIdentity: () => ({ currentTenant: { id: "t" } }) }));
afterEach(cleanup);
it("deduplicates recent rows and offers explicit pagination without exceeding twelve visible rows", () => {
  const fetchNextPage = vi.fn();
  recent.mockReturnValue({ data: { pages: [{ items: [{ id: "a", title: "First", status: "active" }, { id: "b", title: "Second", status: "idle" }] }, { items: [{ id: "a", title: "First", status: "active" }] }] }, hasNextPage: true, fetchNextPage });
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><RecentSessions /></QueryClientProvider></MemoryRouter>);
  expect(screen.getAllByRole("link")).toHaveLength(2); expect(screen.getByRole("button", { name: "加载更多" })).toBeTruthy();
});
