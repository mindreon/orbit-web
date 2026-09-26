import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/task/:id", element: <App /> },
  { path: "/assistants", element: <App /> },
  { path: "/projects", element: <App /> },
  { path: "/experts", element: <App /> },
  { path: "/experts/skills", element: <App /> },
  { path: "/experts/connectors", element: <App /> },
  { path: "/automation", element: <App /> },
  { path: "/library", element: <App /> },
  { path: "/files", element: <App /> },
  { path: "/mail", element: <App /> },
  { path: "/docs", element: <App /> },
  { path: "/ima", element: <App /> },
  { path: "/lexiang", element: <App /> },
  { path: "/inspiration", element: <App /> },
  { path: "/settings", element: <App /> },
  { path: "/archived", element: <App /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
