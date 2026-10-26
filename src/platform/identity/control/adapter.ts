import type { IdentityAdapter } from "../index";
import { api } from "../../client";
import { fetchAuthConfig, requestDevToken } from "../../../api/auth";
import { toRouterPath } from "../../../lib/basePath";
import { AuthController } from "./controller";
import { browserStore } from "../storage";
import { createElement } from "react";
import { ControlSignInProvider } from "./AuthProvider";
import { LoginPage } from "./LoginPage";
import { AuthCallbackPage } from "./AuthCallbackPage";

// Deferred lookups break the adapter/client bootstrap cycle; only this implementation knows control credentials.
export const auth = new AuthController({
  loadConfig: () => fetchAuthConfig(api),
  requestDevToken: (body) => requestDevToken(api, body),
  store: browserStore(),
  redirect: (url) => window.location.assign(url),
  origin: window.location.origin,
  // Router paths for returnTo: the URL carries BASE_PATH, navigate() under the same basename would double it.
  currentPath: () => toRouterPath(window.location.pathname + window.location.search + window.location.hash),
});
export const controlIdentity: IdentityAdapter = {
  subscribe: (listener) => auth.subscribe(listener),
  snapshot: () => auth.getSnapshot(),
  credentials: {
    token: () => auth.token(),
    tenant: () => auth.tenant(),
    unauthorized: () => auth.unauthorized(),
  },
  initialize: () => auth.initialize(),
  setTenant: (tenantId) => auth.setTenant(tenantId),
  signOut: () => auth.logout(),
  SignInPage: () => createElement(ControlSignInProvider, null, createElement(LoginPage)),
  CallbackPage: () => createElement(ControlSignInProvider, null, createElement(AuthCallbackPage)),
};
