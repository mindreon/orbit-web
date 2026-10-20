import type { Asset } from "../../api/types";
import { validatePath } from "../../lib/tar";
const mcp = '{"mcpServers":{"test":{"url":"http://testmcp:8000/mcp","transport":"streamable_http","tools":{"wait_seconds":{"effectClass":"read_only"}}}}}\n';
export function template(kind: Asset["kind"]): Record<string, string> {
  switch (kind) {
    case "agent": return { "agent.json": '{"schema":"orbit.agent/v2","name":"echo-agent","model":"default","permissions":{"effectClasses":["read_only","sandbox_write"]}}\n', "AGENTS.md": "You are a helpful assistant. Reply to the user's message clearly and remember the conversation. Do not invent tool results.\n", "mcp.json": mcp };
    case "skill": return { "SKILL.md": "---\nname: example-skill\ndescription: Describe when to use this skill.\n---\n\n# Instructions\n\nDescribe the steps to follow.\n" };
    case "mcp_server": return { "mcp.json": mcp };
    case "team": return { "team.json": JSON.stringify({ schema: "orbit.team/v1", name: "example-team", description: "Describe this expert team.", roles: [{ name: "leader", role: "leader", agent: "dev/echo-agent@^1.0" }], dispatch: "scheduled", sharedSkills: [] }, null, 2) + "\n" };
  }
}
export type EditorFile = { path: string; bytes: Uint8Array; text: string | null; original: string | null; added: boolean; deleted: boolean };
export function editorFile(path: string, text: string, added = false): EditorFile { return { path, bytes: new TextEncoder().encode(text), text, original: text, added, deleted: false }; }
export function packEditorFiles(files: readonly EditorFile[]) {
  return Object.fromEntries(files.filter((f) => !f.deleted).map((f) => [f.path, f.text === null || f.text === f.original ? f.bytes : f.text]));
}
export const fileState = (file: EditorFile) => file.deleted ? "已删除" : file.added ? "新增" : file.text !== file.original ? "已修改" : "未修改";
export function jsonError(path: string, text: string | null): string | null {
  if (!path.endsWith(".json") || text === null) return null;
  try { JSON.parse(text); return null; } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 无效";
    const position = /position (\d+)/.exec(message); const line = /line (\d+)/.exec(message)?.[1] ?? (position ? String(text.slice(0, Number(position[1])).split("\n").length) : String(text.split("\n").length));
    return `JSON 无效 · 第 ${line} 行：${message}`;
  }
}
export function newFile(files: EditorFile[], path: string): EditorFile[] {
  validatePath(path);
  if (files.some((f) => f.path.normalize("NFC").toLowerCase() === path.normalize("NFC").toLowerCase())) throw new Error("文件已存在，请恢复已删除文件或使用新路径");
  return [...files, editorFile(path, "", true)];
}
export const versionValid = (value: string) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
export function nextPatch(value?: string) { const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? ""); return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : "1.0.0"; }
