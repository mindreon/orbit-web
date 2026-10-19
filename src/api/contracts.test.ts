import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eventDataSchemas } from "./events";
import { errorMessage, errorMessages } from "./errorMessages";
import { schemaEnum } from "../test/schemaEnum";
import { assetRefs, splitRef } from "./assetRefs";

describe("generated contract coverage", () => {
  it("U1 maps every generated event to the canonical contract data schema", () => {
    const contract = JSON.parse(readFileSync(path.resolve(process.env.ORBIT_CONTRACT_DIR ?? "../orbit-control/contract/v2/schema", "run_event.json"), "utf8"));
    const expected = Object.fromEntries(contract.$defs.RunEvent.allOf.map((branch: { if: { properties: { type: { const: string } } }; then: { properties: { data: { $ref: string } } } }) => [branch.if.properties.type.const, branch.then.properties.data.$ref.split("/").at(-1)]));
    expect(eventDataSchemas).toEqual(expected);
    expect(Object.keys(eventDataSchemas).sort()).toEqual(schemaEnum("EventType"));
  });
  it("U4 covers error codes exactly, uses expert terminology and preserves unknown messages", () => {
    expect(Object.keys(errorMessages).sort()).toEqual(schemaEnum("Error", "error", "code"));
    expect(errorMessages.LOCK_RESOLUTION_FAILED).toContain("专家");
    expect(errorMessages.ENTRY_KIND_AMBIGUOUS).toContain("专家");
    expect(errorMessage("FUTURE_ERROR", "server message")).toBe("server message");
  });
});
describe("U16 manifest references", () => {
  it("retains manifest order and distinguishes catalog, bundled and direct entries without leaking URL credentials", () => {
    expect(assetRefs({ skills: { skills: [{ name: "first", source: "catalog", id: "p/a", version: "^1" }, { name: "local", source: "bundle" }] }, mcp: { mcpServers: { asset: { ref: "p/m@^2" }, remote: { url: "https://user:secret@example.test:443/path?token=secret" }, local: { command: "private-command" } } }, team: { roles: [{ name: "writer", agent: "p/w" }, { name: "local", agent: "./agents/local" }] } })).toEqual([
      { kind: "catalog-skill", name: "first", ref: "p/a", range: "^1" },
      { kind: "bundle-skill", name: "local", path: "skills/local/" },
      { kind: "mcp-asset", name: "asset", ref: "p/m", range: "^2" },
      { kind: "direct-mcp", name: "remote", host: "example.test" },
      { kind: "direct-mcp", name: "local", host: undefined },
      { kind: "agent", name: "writer", ref: "p/w", range: "*" },
    ]);
  });
  it("matches control SplitRef for no suffix, empty suffix and first @", () => {
    expect(["p/a", "p/a@", "p/a@^1@extra"].map(splitRef)).toEqual([{ ref: "p/a", range: "*" }, { ref: "p/a", range: "*" }, { ref: "p/a", range: "^1@extra" }]);
    expect(assetRefs(null)).toEqual([]);
    expect(assetRefs({ mcp: { mcpServers: { bad: { url: "not a URL" } } } })).toEqual([{ kind: "direct-mcp", name: "bad", host: undefined }]);
  });
});
