import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { describeFailure } from "../api/errors";
import { BASE_PATH } from "../lib/basePath";
import { defaultIdentity, IdentityProvider, RequireIdentity } from "../platform/identity";
import { TenantGate } from "../platform/tenancy/TenantGate";
import { WorkspaceProvider } from "../platform/tenancy/WorkspaceProvider";
import { createQueryClient } from "../platform/queryClient";
import { toast } from "../platform/toast/store";
import { ToastViewport } from "../platform/toast/ToastViewport";
import { WujieBridge } from "../platform/embed";
import { Skeleton } from "../ui/Skeleton";
import { AppLayout } from "./AppLayout";
import { ErrorBoundary } from "./ErrorBoundary";
import { MePage } from "./MePage";
import { NotFoundPage } from "./NotFoundPage";
import { featureRoutes } from "./routes";
import { InboxSourceContext, controlInboxSource } from "../features/interactions";

const queryClient = createQueryClient((error) => toast.error(describeFailure("操作失败", error)));
const SignInPage = defaultIdentity.SignInPage;
const CallbackPage = defaultIdentity.CallbackPage;

/** 嵌入态路由桥：子应用路由变化上报 `orbit:route-change`，收 `orbit:navigate` 以 replace 导航（独立部署零行为）。 */
function OrbitWujieBridge() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const replace = useCallback((path: string) => navigate(path, { replace: true }), [navigate]);
  return <WujieBridge prefix="orbit" pathname={pathname} search={search} navigate={replace} />;
}

export function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter basename={BASE_PATH}><IdentityProvider adapter={defaultIdentity}>
    <OrbitWujieBridge />
    <Suspense fallback={<Skeleton className="m-6 h-24" />}><Routes>
      <Route path="/login" element={<SignInPage />} />
      {CallbackPage ? <Route path="/auth/callback" element={<CallbackPage />} /> : null}
      <Route element={<RequireIdentity />}>
        <Route element={<TenantGate />}><Route element={<WorkspaceProvider><InboxSourceContext.Provider value={controlInboxSource}><AppLayout /></InboxSourceContext.Provider></WorkspaceProvider>}>
          <Route index element={<Navigate to="/sessions" replace />} />
          {featureRoutes}
          <Route path="me" element={<MePage />} /><Route path="*" element={<NotFoundPage />} />
        </Route></Route>
      </Route>
    </Routes></Suspense><ToastViewport />
  </IdentityProvider></BrowserRouter></QueryClientProvider></ErrorBoundary>;
}
