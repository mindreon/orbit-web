import type { S } from "./types";

export interface AssetReference {
  kind: "catalog-skill" | "bundle-skill" | "mcp-asset" | "direct-mcp" | "agent";
  name: string;
  ref?: string;
  range?: string;
  host?: string;
  path?: string;
}
/** Matches control SplitRef, including an empty suffix defaulting to *. */
export function splitRef(value: string): { ref: string; range: string } {
  const at = value.indexOf("@");
  return at < 0 ? { ref: value, range: "*" } : { ref: value.slice(0, at), range: value.slice(at + 1) || "*" };
}
export function assetRefs(manifest: unknown): AssetReference[] {
  if (!manifest || typeof manifest !== "object") return [];
  const value = manifest as { skills?: S["SkillsManifest"]; mcp?: S["McpManifest"]; team?: S["TeamManifest"] };
  const refs: AssetReference[] = [];
  for (const skill of value.skills?.skills ?? []) {
    if (skill.source === "catalog" && skill.id) refs.push({ kind: "catalog-skill", name: skill.name, ref: skill.id, range: skill.version || "*" });
    if (skill.source === "bundle") refs.push({ kind: "bundle-skill", name: skill.name, path: `skills/${skill.name}/` });
  }
  for (const [name, server] of Object.entries(value.mcp?.mcpServers ?? {})) {
    if (server.ref) refs.push({ kind: "mcp-asset", name, ...splitRef(server.ref) });
    else if (server.url || server.command) {
      let host: string | undefined;
      try { host = server.url ? new URL(server.url).host : undefined; } catch { /* Do not expose malformed URL contents. */ }
      refs.push({ kind: "direct-mcp", name, host });
    }
  }
  for (const member of value.team?.roles ?? []) {
    if (member.agent !== "." && !member.agent.startsWith("./")) refs.push({ kind: "agent", name: member.name, ...splitRef(member.agent) });
  }
  return refs;
}
