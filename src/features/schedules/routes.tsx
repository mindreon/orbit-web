import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="schedules" element={<Page />} />
  <Route path="schedules/new" element={<Page mode="new" />} />
  <Route path="schedules/:scheduleId" element={<Page mode="detail" />} />
  <Route path="schedules/:scheduleId/edit" element={<Page mode="edit" />} />
</>;
