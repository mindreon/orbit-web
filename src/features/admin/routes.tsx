import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="usage" element={<Page title="用量" />} />
  <Route path="admin/workspaces" element={<Page title="工作空间" />} />
  <Route path="admin/workspaces/:workspaceId" element={<Page title="工作空间详情" />} />
  <Route path="admin/members" element={<Page title="成员" />} />
  <Route path="admin/api-keys" element={<Page title="API Key" />} />
  <Route path="admin/audit" element={<Page title="审计" />} />
  <Route path="admin/models" element={<Page title="模型" />} />
  <Route path="admin/secrets" element={<Page title="密钥" />} />
  <Route path="admin/quotas" element={<Page title="额度" />} />
</>;
