import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import { purgeLegacyModelStorage } from "./lib/legacyStorage";
import { AssistantsPage } from "./pages/Assistants";
import { ConnectorCreatePage } from "./pages/ConnectorCreate";
import { ConnectorsPage } from "./pages/Connectors";
import { McpMarketDetailPage } from "./pages/McpMarketDetail";
import { SkillDetailPage } from "./pages/SkillDetail";
import { SkillsPage } from "./pages/Skills";
import { HomePage } from "./pages/Home";
import { NotFoundPage, RouteErrorPage } from "./pages/NotFound";
import { ArchivedPage, SettingsPage } from "./pages/Sections";
import { UnwiredPage } from "./pages/UnwiredPage";
import { WorkbenchPage } from "./pages/Workbench";
import "./index.css";

purgeLegacyModelStorage();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "task/:id", element: <WorkbenchPage /> },
          { path: "assistants", element: <AssistantsPage /> },
          { path: "projects", element: <UnwiredPage title="项目" /> },
          { path: "experts", element: <UnwiredPage title="专家" /> },
          { path: "experts/skills", element: <SkillsPage /> },
          { path: "experts/skills/:handle/:slug", element: <SkillDetailPage /> },
          { path: "experts/skills/:slug", element: <SkillDetailPage /> },
          { path: "experts/connectors", element: <ConnectorsPage /> },
          { path: "experts/connectors/new", element: <ConnectorCreatePage /> },
          { path: "experts/connectors/:id", element: <McpMarketDetailPage /> },
          { path: "automation", element: <UnwiredPage title="定时任务" /> },
          { path: "library", element: <UnwiredPage title="资料库" /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "archived", element: <ArchivedPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
