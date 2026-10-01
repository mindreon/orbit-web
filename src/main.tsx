import { Clock, FolderKanban, Library } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { App } from "./App";
import { ensureMountPoint } from "./embed/mount";
import { ensureEmbeddedStyles } from "./embed/styles";
import { isEmbeddedInWujie } from "./embed/wujie";
import { AgentsPage } from "./pages/Agents";
import { AgentDetailPage } from "./pages/AgentDetail";
import { NewTaskPage } from "./pages/NewTask";
import { ConnectorCreatePage } from "./pages/ConnectorCreate";
import { ExpertEditorPage } from "./pages/ExpertEditor";
import { ConnectorsPage } from "./pages/Connectors";
import { McpMarketDetailPage } from "./pages/McpMarketDetail";
import { SkillDetailPage } from "./pages/SkillDetail";
import { SkillsPage } from "./pages/Skills";
import { NotFoundPage, RouteErrorPage } from "./pages/NotFound";
import { SettingsPage } from "./pages/Settings";
import { UnwiredPage } from "./pages/UnwiredPage";
import { TaskPage } from "./pages/Task";
import { TasksLayout } from "./shell/TaskRail";
import "./index.css";

const routes = [
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          {
            element: <TasksLayout />,
            children: [
              { index: true, element: <NewTaskPage /> },
              { path: "tasks/:taskId", element: <TaskPage /> },
            ],
          },
          { path: "tasks", element: <Navigate to="/" replace /> },
          { path: "experts", element: <Navigate to="/experts/agents" replace /> },
          { path: "projects", element: <UnwiredPage title="项目" icon={FolderKanban} subtitle="多人协同，打造超级团队" action="新建项目" /> },
          { path: "experts/skills", element: <SkillsPage /> },
          { path: "experts/new", element: <ExpertEditorPage /> },
          { path: "experts/:expertId/edit", element: <ExpertEditorPage /> },
          { path: "experts/agents", element: <AgentsPage /> },
          { path: "experts/agents/:handle/:slug", element: <AgentDetailPage /> },
          { path: "experts/agents/:slug", element: <AgentDetailPage /> },
          { path: "experts/skills/:handle/:slug", element: <SkillDetailPage /> },
          { path: "experts/skills/:slug", element: <SkillDetailPage /> },
          { path: "experts/connectors", element: <ConnectorsPage /> },
          { path: "experts/connectors/new", element: <ConnectorCreatePage /> },
          { path: "experts/connectors/:id", element: <McpMarketDetailPage /> },
          { path: "automation", element: <UnwiredPage title="定时任务" icon={Clock} subtitle="让任务按时间自动运行" action="添加定时任务" /> },
          { path: "library", element: <UnwiredPage title="资料库" icon={Library} subtitle="沉淀文档和资料，供任务引用" action="添加资料" /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

function start() {
  createRoot(ensureMountPoint("root")).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

if (isEmbeddedInWujie()) {
  // wujie 会丢掉模板 head 里的样式表，嵌入态自带 CSS，样式就位后再渲染。
  import("./index.css?inline").then((css) => {
    ensureEmbeddedStyles(css.default);
    start();
  });
} else {
  start();
}
