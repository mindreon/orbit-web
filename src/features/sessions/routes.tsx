import { lazy } from "react";
import { Route } from "react-router";
const Home = lazy(() => import("./Page"));
const SessionPage = lazy(() => import("./SessionPage"));
export const routes = <>
  <Route path="sessions" element={<Home />} />
  <Route path="sessions/:sessionId" element={<SessionPage />} />
</>;
