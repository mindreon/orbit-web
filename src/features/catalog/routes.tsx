import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="experts" element={<Page kind="agent" />} />
  <Route path="expert-teams" element={<Page kind="team" />} />
</>;
