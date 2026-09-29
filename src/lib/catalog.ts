import { api } from "./api";

export interface Persona {
  id: string;
  name: string;
  instructions: string;
  mcpConnectorIds?: string[];
  createdAt: string;
}

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

export function listPersonas() {
  return api<{ items: Persona[] | null }>("/v1/personas");
}

export function createPersona(body: { name: string; instructions: string }) {
  return api<Persona>("/v1/personas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listMcpConnectors() {
  return api<{ items: McpConnector[] | null }>("/v1/mcp-connectors");
}

export interface Skill {
  id: string;
  slug: string;
  handle: string;
  name: string;
  description: string;
  category: string;
  categoryName: string;
  iconUrl: string;
  downloads: number;
  stars: number;
  source: string;
  version: string;
  requiresApiKey: boolean;
  paid: boolean;
  score: number;
  updatedAt: string;
  trendingRank: number;
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

export function listSkills(query: SkillQuery = {}) {
  const params = new URLSearchParams();
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.category) params.set("category", query.category);
  if (query.source) params.set("source", query.source);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.page) params.set("page", String(query.page));
  params.set("pageSize", "24");
  const qs = params.toString();
  return api<{ items: Skill[] | null; total: number; page: number; pageSize: number; syncedAt: string }>(`/v1/skills${qs ? `?${qs}` : ""}`);
}

export function listSkillCategories() {
  return api<{ items: SkillCategory[] | null }>("/v1/skill-categories");
}

export interface SkillTextFile {
  path: string;
  body: string;
}

export interface SkillPageMeta {
  summary?: string;
  summaryZh?: string;
  subCategories?: { key: string; name: string }[];
  safe?: boolean;
  score?: number;
  version?: string;
  updatedAt?: number;
  versionCreatedAt?: number;
  fileIndex?: { path: string; size: number }[];
  versions?: { version: string; changelog?: string; createdAt?: number }[];
  evaluation?: {
    userSummary?: string;
    createdAt?: number;
    score: number;
    dimensions?: {
      key: string;
      label: string;
      labelZh: string;
      description?: string;
      score: number;
      summary?: string;
    }[];
  };
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
  // The first open of a skill may copy the package. That is slower than a saved read.
  return api<{ items: SkillTextFile[] | null; meta?: SkillPageMeta }>(path, { timeoutMs: 60000 });
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
  page?: number;
}

export function listMcpMarket(query: McpMarketQuery = {}) {
  const params = new URLSearchParams();
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.category) params.set("category", query.category);
  if (query.serviceType) params.set("serviceType", query.serviceType);
  if (query.needsOnline) params.set("needsOnline", query.needsOnline);
  if (query.page) params.set("page", String(query.page));
  params.set("pageSize", "30");
  const qs = params.toString();
  return api<{ items: McpMarketServer[] | null; total: number; stored: number; plazaTotal: number; page: number; pageSize: number }>(
    `/v1/mcp-market?${qs}`,
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
