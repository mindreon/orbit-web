import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="inbox" element={<Page title="收件箱" />} />
</>;
