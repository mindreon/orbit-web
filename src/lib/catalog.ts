import { api } from "./api";

export interface McpHeaderRef {
  name: string;
  env: string;
}

export interface McpConnector {
  id: string;
  name: string;
  transport?: "stdio" | "streamable_http";
  command: string;
  args?: string[];
  envRefs?: string[];
  url?: string;
  headerRefs?: McpHeaderRef[];
  defaultOpen?: boolean;
  createdAt: string;
}

export function listMcpConnectors() {
  return api<{ items: McpConnector[] | null }>("/v1/mcp-connectors");
}

export interface Skill {
  id: string;
  handle: string;
  slug: string;
  name: string;
  description: string;
  descriptionEn: string;
  category: string;
  categoryName: string;
  tags: string[];
  license: string;
  iconUrl: string;
  sourceUrl: string;
  downloads: number;
  visits: number;
  likes: number;
  updatedAt: string;
  source: string;
}

export interface SkillCategory {
  key: string;
  name: string;
  nameEn: string;
  sortOrder: number;
}

export interface SkillQuery {
  sortBy?: string;
  category?: string;
  source?: string;
  keyword?: string;
  page?: number;
}

export function listSkills(query: SkillQuery = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.category) params.set("category", query.category);
  if (query.source) params.set("source", query.source);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.page) params.set("page", String(query.page));
  params.set("pageSize", "24");
  const qs = params.toString();
  return api<{ items: Skill[] | null; total: number; page: number; pageSize: number; installedAt: string }>(`/v1/skills${qs ? `?${qs}` : ""}`, { signal });
}

export function listSkillCategories() {
  return api<{ items: SkillCategory[] | null }>("/v1/skill-categories");
}

export interface SkillTextFile {
  path: string;
  body: string;
}

function skillApiPath(handle: string, slug: string) {
  if (!handle) return `/v1/skills/${encodeURIComponent(slug)}`;
  return `/v1/skills/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
}

export function getSkill(handle: string, slug: string) {
  return api<Skill>(skillApiPath(handle, slug));
}

export function listSkillFiles(handle: string, slug: string) {
  const path = skillApiPath(handle, slug).replace("/v1/skills/", "/v1/skill-files/");
  return api<{ items: SkillTextFile[] | null }>(path);
}

export interface McpMarketServer {
  id: string;
  name: string;
  summary: string;
  author: string;
  category: string;
  categoryName: string;
  categoryMore: number;
  calls: number;
  views: number;
  stars: number;
  verified: boolean;
  hosted: boolean;
  needsOnline: boolean;
  source: string;
}

export interface McpMarketCategory {
  key: string;
  name: string;
  sortOrder: number;
  count: number;
}

export interface McpMarketQuery {
  keyword?: string;
  category?: string;
  serviceType?: "" | "hosted" | "local";
  needsOnline?: "" | "true" | "false";
  source?: string;
  page?: number;
}

export function listMcpMarket(query: McpMarketQuery = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.category) params.set("category", query.category);
  if (query.serviceType) params.set("serviceType", query.serviceType);
  if (query.needsOnline) params.set("needsOnline", query.needsOnline);
  if (query.source) params.set("source", query.source);
  if (query.page) params.set("page", String(query.page));
  params.set("pageSize", "30");
  const qs = params.toString();
  return api<{ items: McpMarketServer[] | null; total: number; stored: number; page: number; pageSize: number }>(
    `/v1/mcp-market?${qs}`,
    { signal },
  );
}

export function listMcpMarketCategories(needsOnline?: "true" | "false") {
  const qs = needsOnline ? `?needsOnline=${needsOnline}` : "";
  return api<{ items: McpMarketCategory[] | null }>(`/v1/mcp-market-categories${qs}`);
}

export interface McpMarketToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface McpMarketTool {
  name: string;
  description: string;
  params: McpMarketToolParam[];
}

export interface McpMarketDetail extends McpMarketServer {
  license: string;
  updatedOn: string;
  readme: string;
  tools: McpMarketTool[];
}

export function getMcpMarket(id: string) {
  return api<McpMarketDetail>(`/v1/mcp-market/${encodeURIComponent(id)}`);
}

export interface AgentModel {
  name: string;
  supplier: string;
  protocol: string;
}

export interface AgentRef {
  name: string;
  description: string;
}

export interface AgentPrompt {
  filename: string;
  content: string;
}

export interface Agent {
  id: string;
  handle: string;
  slug: string;
  name: string;
  description: string;
  framework: string;
  license: string;
  logoUrl: string;
  catalogues: string[];
  models: AgentModel[];
  mcps: AgentRef[];
  skills: AgentRef[];
  systemPrompts: AgentPrompt[];
  readme: string;
  files: SkillTextFile[];
  stars: number;
  downloads: number;
  visits: number;
  updatedAt: string;
  source: string;
}

export interface AgentQuery {
  sortBy?: string;
  catalogue?: string;
  keyword?: string;
  page?: number;
}

export function listAgents(query: AgentQuery = {}) {
  const params = new URLSearchParams();
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.catalogue) params.set("catalogue", query.catalogue);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.page) params.set("page", String(query.page));
  params.set("pageSize", "24");
  const qs = params.toString();
  return api<{ items: Agent[] | null; total: number; page: number; pageSize: number }>(`/v1/agents${qs ? `?${qs}` : ""}`);
}

export function agentPath(handle: string, slug: string) {
  if (!slug) return "/experts/agents";
  if (!handle) return `/experts/agents/${encodeURIComponent(slug)}`;
  return `/experts/agents/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
}

export function getAgent(handle: string, slug: string) {
  return api<Agent>(`/v1/agents/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`);
}

export function mcpMarketIconPath(id: string) {
  return `/v1/mcp-market/${encodeURIComponent(id)}/icon`;
}

export function skillIconPath(handle: string, slug: string) {
  return `/v1/skills/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}/icon`;
}

export function agentIconPath(handle: string, slug: string) {
  return `/v1/agents/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}/icon`;
}

export function createMcpConnector(body: {
  name: string;
  transport?: "stdio" | "streamable_http";
  command?: string;
  args?: string[];
  envRefs?: string[];
  url?: string;
  headerRefs?: McpHeaderRef[];
  defaultOpen?: boolean;
}) {
  return api<McpConnector>("/v1/mcp-connectors", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
