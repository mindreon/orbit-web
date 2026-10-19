import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="assets" element={<Page title="资产中心" />} />
  <Route path="assets/mine" element={<Page title="我的资产" />} />
  <Route path="assets/new" element={<Page title="新建资产" />} />
  <Route path="assets/:assetId" element={<Page title="资产详情" />} />
  <Route path="assets/:assetId/versions/new" element={<Page title="版本编辑器" />} />
  <Route path="assets/:assetId/versions/:versionId" element={<Page title="版本详情" />} />
</>;
