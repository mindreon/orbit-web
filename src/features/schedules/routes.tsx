import { lazy } from "react";
import { Route } from "react-router";
const Page = lazy(() => import("./Page"));
export const routes = <>
  <Route path="schedules" element={<Page title="定时任务" />} />
  <Route path="schedules/new" element={<Page title="新建定时任务" />} />
  <Route path="schedules/:scheduleId" element={<Page title="定时任务详情" />} />
</>;
