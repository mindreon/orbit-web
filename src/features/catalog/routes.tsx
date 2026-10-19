import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="experts" element={<Page title="专家" />} />
  <Route path="expert-teams" element={<Page title="专家团" />} />
</>;
