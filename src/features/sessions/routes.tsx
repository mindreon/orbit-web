import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="sessions" element={<Page title="会话" />} />
  <Route path="sessions/:sessionId" element={<Page title="会话" />} />
</>;
