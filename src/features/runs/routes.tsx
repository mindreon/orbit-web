import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="runs/:runId" element={<Page />} />
</>;
