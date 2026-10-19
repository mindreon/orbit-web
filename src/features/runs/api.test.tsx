// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { Run } from "../../api/types";
import { useRunResources } from "./api";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../platform/client", () => ({ api: { get } }));
afterEach(() => { cleanup(); get.mockReset(); });
it("defaults sparse replay page arrays, segment usage, cost items and stored interaction arrays", async () => {
  get.mockImplementation(async (path: string) => {
    if (path.endsWith("/segments")) return { items: [{ member: "main", seq: 1 }] };
    if (path.endsWith("/effects")) return {};
    if (path.endsWith("/cost")) return { total_millicredits: 0 };
    if (path.endsWith("/interactions")) return { items: [
      { id: "q", request: { interaction_id: "q", kind: "ask_user", question: { text: "answer?" } } },
      { id: "a", approvers: ["me"], request: { interaction_id: "a", kind: "tool_approval", calls: [{ name: "write", call_id: "c", args_preview: "{}", effect_class: "external_write" }] } },
    ] };
    return { entry_kind: "agent" };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useRunResources({ id: "r", session_id: "s" } as Run, "t"), { wrapper });
  await waitFor(() => expect(Object.values(view.result.current).every((query) => query.isSuccess)).toBe(true));
  expect(view.result.current.segments.data).toEqual([{ member: "main", seq: 1, usage: [] }]);
  expect(view.result.current.effects.data).toEqual([]);
  expect(view.result.current.cost.data).toEqual({ total_millicredits: 0, items: [] });
  const interactions = view.result.current.interactions.data!.items;
  expect(interactions[0].approvers).toEqual([]);
  expect(interactions[0].request.question?.options).toEqual([]);
  expect(interactions[1].approvers).toEqual(["me"]);
  expect(interactions[1].request.calls?.[0].risk_reasons).toEqual([]);
  view.unmount(); client.clear();
});
