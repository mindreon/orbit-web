import { lazy } from "react";
import { Route } from "react-router";
import { AgentDetailPage, ExpertsPage } from "./Agents";
import { MCPPage, SkillsPage } from "./Market";
import { MCPDetailPage, SkillDetailPage } from "./MarketDetail";
const Page = lazy(() => import("./Page"));
const Create = lazy(() => import("./Create"));
export const routes = <>
  <Route path="experts" element={<ExpertsPage />} />
  <Route path="experts/new" element={<Create />} />
  <Route path="experts/:handle/:slug" element={<AgentDetailPage />} />
  <Route path="expert-teams" element={<Page kind="team" />} />
  <Route path="skills" element={<SkillsPage />} />
  <Route path="skills/:handle/:slug" element={<SkillDetailPage />} />
  <Route path="mcp" element={<MCPPage />} />
  <Route path="mcp/:id" element={<MCPDetailPage />} />
</>;
