import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="usage" element={<Page tab="usage" />} />
  <Route path="admin/workspaces" element={<Page tab="workspaces" />} />
  <Route path="admin/workspaces/:workspaceId" element={<Page tab="workspace-detail" />} />
  <Route path="admin/members" element={<Page tab="members" />} />
  <Route path="admin/api-keys" element={<Page tab="api-keys" />} />
  <Route path="admin/service-accounts" element={<Page tab="service-accounts" />} />
  <Route path="admin/audit" element={<Page tab="audit" />} />
  <Route path="admin/models" element={<Page tab="models" />} />
  <Route path="admin/secrets" element={<Page tab="secrets" />} />
  <Route path="admin/quotas" element={<Page tab="quotas" />} />
</>;
