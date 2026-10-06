import { afterEach, describe, expect, it, vi } from "vitest";
import { createExpert, expertFromAgent, getExpertFile, listExpertFiles, listExperts, updateExpert } from "./experts";

/**
 * Ways the bundle calls can fail, each asserted below:
 *   F1 the soul is dropped from the create or update body
 *   F2 soul and mcp_unbound on an expert are lost on read
 *   F3 the files list asks for the wrong URL (version missing, or sent when it should be omitted)
 *   F4 a file path loses its slashes or keeps unsafe characters unencoded (spaces, #, ?, non-ASCII)
 *   F5 the import result loses mcp_unbound or skipped_files
 */
const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const stub = (body: unknown) => {
  const fetchMock = reply(body);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const call = (fetchMock: ReturnType<typeof reply>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
  return { url, init };
};

afterEach(() => vi.unstubAllGlobals());

describe("expert soul", () => {
  it("sends soul on create and update (F1)", async () => {
    const create = stub({});
    await createExpert({ name: "a", soul: "沉稳", instructions: "做事" });
    expect(JSON.parse(String(call(create).init?.body))).toMatchObject({ soul: "沉稳", instructions: "做事" });
    const update = stub({});
    await updateExpert("e 1", { name: "a", soul: "" });
    expect(call(update).url).toBe("/v1/experts/e%201");
    expect(JSON.parse(String(call(update).init?.body))).toHaveProperty("soul", "");
  });

  it("reads soul and mcp_unbound (F2)", async () => {
    stub({ items: [{ expert_id: "e", soul: "s", mcp_unbound: [{ name: "gh", reason: "没有对应的连接器" }] }] });
    const [expert] = await listExperts();
    expect(expert.soul).toBe("s");
    expect(expert.mcp_unbound).toEqual([{ name: "gh", reason: "没有对应的连接器" }]);
  });
});

describe("expert files", () => {
  it("lists the latest, or a given version (F3)", async () => {
    const latest = stub({ version: 3, files: [{ path: "AGENTS.md", size: 1, sha256: "x" }] });
    const body = await listExpertFiles("e1");
    expect(call(latest).url).toBe("/v1/experts/e1/files");
    expect(body.files).toHaveLength(1);
    const pinned = stub({ version: 2, files: [] });
    await listExpertFiles("e1", 2);
    expect(call(pinned).url).toBe("/v1/experts/e1/files?version=2");
  });

  it("encodes each path segment and keeps the slashes (F4)", async () => {
    const fetchMock = stub({ path: "p", content: "c", sha256: "x" });
    await getExpertFile("e1", "skills/发布 notes/a#b?.md", 4);
    expect(call(fetchMock).url).toBe(`/v1/experts/e1/files/skills/${encodeURIComponent("发布 notes")}/a%23b%3F.md?version=4`);
  });
});

describe("expertFromAgent", () => {
  it("returns unbound mcp and skipped files (F5)", async () => {
    stub({ expert: { expert_id: "e" }, unmatched: { skills: [], connectors: [] }, mcp_unbound: [{ name: "x", reason: "r" }], skipped_files: [{ path: "a.png", reason: "二进制" }] });
    const result = await expertFromAgent("h", "s");
    expect(result.mcp_unbound).toEqual([{ name: "x", reason: "r" }]);
    expect(result.skipped_files).toEqual([{ path: "a.png", reason: "二进制" }]);
  });
});
