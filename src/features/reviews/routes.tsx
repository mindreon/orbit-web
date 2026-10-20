import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
const ReviewPage = lazy(() => import("./ReviewPage"));
export const routes = <>
  <Route path="reviews" element={<Page />} />
  <Route path="reviews/:versionId" element={<ReviewPage />} />
</>;
