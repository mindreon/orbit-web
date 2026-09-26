import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import { purgeLegacyModelStorage } from "./lib/legacyStorage";
import { HomePage } from "./pages/Home";
import { NotFoundPage, RouteErrorPage } from "./pages/NotFound";
import {
  ArchivedPage,
  AssistantsPage,
  AutomationPage,
  ExpertsPage,
  LibraryPage,
  ProjectsPage,
  SettingsPage,
} from "./pages/Sections";
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
          { path: "projects", element: <ProjectsPage /> },
          { path: "experts", element: <ExpertsPage tab="experts" /> },
          { path: "experts/skills", element: <ExpertsPage tab="skills" /> },
          { path: "experts/connectors", element: <ExpertsPage tab="connectors" /> },
          { path: "automation", element: <AutomationPage /> },
          { path: "library", element: <LibraryPage /> },
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
