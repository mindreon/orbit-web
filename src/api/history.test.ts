import { describe, expect, it, vi } from "vitest";
import { apiError, json } from "../test/helpers";
import { createApiClient } from "./client";
import { fetchRunHistory, fetchSessionHistory } from "./history";

const final = { v: 1, id: "event-1", type: "message.final", member: "main", segment: 1, attempt: 0, data: { message_id: "m1", text: "" } };

function setup(pages: Response[]) {
  const requests: { url: string; headers: Headers; signal: AbortSignal | null | undefined }[] = [];
  const client = createApiClient({
    credentials: { token: () => "login-token", tenant: () => "tenant-1", unauthorized: vi.fn() },
    fetch: async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers), signal: init?.signal });
      const response = pages.shift();
      if (!response) throw new Error("unexpected request");
      return response;
    },
  });
  return { client, requests };
}

describe("history", () => {
  it.each([
    { fetchHistory: fetchRunHistory, id: "r1", path: "/v1/runs/r1/history" },
    { fetchHistory: fetchSessionHistory, id: "s1", path: "/v1/sessions/s1/history" },
  ])("paginates $path using stream cursors and retains filters", async ({ fetchHistory, id, path }) => {
    const second = { ...final, id: "event-2", run_id: "other-run" };
    const { client, requests } = setup([
      json({ items: [final], next_cursor: "9007199254740993", resume_from: "9007199254740993" }),
      json({ items: [second], resume_from: "9007199254740999" }),
    ]);
    const signal = new AbortController().signal;
    await expect(fetchHistory(client, id, { after: "9", types: ["message.final", "run.completed"], signal })).resolves.toEqual({ events: [final, second], resumeFrom: "9007199254740999" });
    expect(requests.map(({ url }) => url)).toEqual([
      `${path}?after=9&types=message.final%2Crun.completed`,
      `${path}?after=9007199254740993&types=message.final%2Crun.completed`,
    ]);
    expect(requests.every(({ headers, signal: sent }) => headers.get("Authorization") === "Bearer login-token" && headers.get("X-Orbit-Tenant") === "tenant-1" && !headers.has("Idempotency-Key") && sent === signal)).toBe(true);
  });

  it("leaves the resume cursor undefined when no history or initial cursor exists", async () => {
    const { client, requests } = setup([json({ items: [], resume_from: "0" })]);
    await expect(fetchRunHistory(client, "r1")).resolves.toEqual({ events: [], resumeFrom: undefined });
    expect(requests[0].url).toBe("/v1/runs/r1/history");
  });

  it("keeps the last populated page's cursor when the second page is empty", async () => {
    const { client, requests } = setup([
      json({ items: [final], next_cursor: "81", resume_from: "81" }),
      json({ items: [], resume_from: "0" }),
    ]);
    await expect(fetchRunHistory(client, "r1")).resolves.toEqual({ events: [final], resumeFrom: "81" });
    expect(requests[1].url).toBe("/v1/runs/r1/history?after=81");
  });

  it("keeps the supplied after cursor when no new rows exist", async () => {
    const { client } = setup([json({ items: [], resume_from: "0" })]);
    await expect(fetchSessionHistory(client, "s1", { after: "81" })).resolves.toEqual({ events: [], resumeFrom: "81" });
  });

  it("omits an empty types filter", async () => {
    const { client, requests } = setup([json({ items: [], resume_from: "0" })]);
    await fetchRunHistory(client, "r1", { types: [] });
    expect(requests[0].url).toBe("/v1/runs/r1/history");
  });

  it("rejects a next_cursor equal to the current after instead of requesting it again", async () => {
    const { client, requests } = setup([
      json({ items: [final], next_cursor: "81", resume_from: "81" }),
      json({ items: [final], next_cursor: "81", resume_from: "81" }),
    ]);
    await expect(fetchRunHistory(client, "r1")).rejects.toThrow("History cursor did not advance");
    expect(requests).toHaveLength(2);
  });

  it("propagates an error on a later page instead of returning partial history", async () => {
    const { client, requests } = setup([json({ items: [final], next_cursor: "81", resume_from: "81" }), apiError(403, "FORBIDDEN")]);
    await expect(fetchSessionHistory(client, "s1")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(requests).toHaveLength(2);
  });

  it("does not fetch another page after cancellation", async () => {
    const controller = new AbortController();
    const client = createApiClient({
      credentials: { token: () => "login-token", tenant: () => null, unauthorized: vi.fn() },
      fetch: vi.fn(async () => { controller.abort(); return json({ items: [final], next_cursor: "81", resume_from: "81" }); }),
    });
    await expect(fetchRunHistory(client, "r1", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
