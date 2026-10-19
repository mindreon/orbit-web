import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="reviews" element={<Page title="审核" />} />
  <Route path="reviews/:versionId" element={<Page title="审核详情" />} />
</>;
