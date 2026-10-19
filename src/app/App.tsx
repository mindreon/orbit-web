import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { describeFailure } from "../api/errors";
import { defaultIdentity, IdentityProvider, RequireIdentity } from "../platform/identity";
import { TenantGate } from "../platform/tenancy/TenantGate";
import { WorkspaceProvider } from "../platform/tenancy/WorkspaceProvider";
import { createQueryClient } from "../platform/queryClient";
import { toast } from "../platform/toast/store";
import { ToastViewport } from "../platform/toast/ToastViewport";
import { Skeleton } from "../ui/Skeleton";
import { AppLayout } from "./AppLayout";
import { ErrorBoundary } from "./ErrorBoundary";
import { MePage } from "./MePage";
import { NotFoundPage } from "./NotFoundPage";
import { featureRoutes } from "./routes";

const queryClient = createQueryClient((error) => toast.error(describeFailure("操作失败", error)));
const SignInPage = defaultIdentity.SignInPage;
const CallbackPage = defaultIdentity.CallbackPage;
export function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter><IdentityProvider adapter={defaultIdentity}>
    <Suspense fallback={<Skeleton className="m-6 h-24" />}><Routes>
      <Route path="/login" element={<SignInPage />} />
      {CallbackPage ? <Route path="/auth/callback" element={<CallbackPage />} /> : null}
      <Route element={<RequireIdentity />}>
        <Route element={<TenantGate />}><Route element={<WorkspaceProvider><AppLayout /></WorkspaceProvider>}>
          <Route index element={<Navigate to="/sessions" replace />} />
          {featureRoutes}
          <Route path="me" element={<MePage />} /><Route path="*" element={<NotFoundPage />} />
        </Route></Route>
      </Route>
    </Routes></Suspense><ToastViewport />
  </IdentityProvider></BrowserRouter></QueryClientProvider></ErrorBoundary>;
}
