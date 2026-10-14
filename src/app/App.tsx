import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { describeFailure } from "../api/errors";
import { AppLayout } from "./AppLayout";
import { AuthCallbackPage } from "./auth/AuthCallbackPage";
import { AuthProvider } from "./auth/AuthProvider";
import { CALLBACK_PATH, LOGIN_PATH } from "./auth/controller";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { ErrorBoundary } from "./ErrorBoundary";
import { MePage } from "./MePage";
import { NotFoundPage } from "./NotFoundPage";
import { createQueryClient } from "./queryClient";
import { toast } from "./toast/store";
import { ToastViewport } from "./toast/ToastViewport";

const queryClient = createQueryClient((error) => toast.error(describeFailure("操作失败", error)));

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path={LOGIN_PATH} element={<LoginPage />} />
              <Route path={CALLBACK_PATH} element={<AuthCallbackPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/me" replace />} />
                  <Route path="me" element={<MePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
            <ToastViewport />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
