import { fetchAuthConfig, requestDevToken } from "../api/auth";
import { createApiClient } from "../api/client";
import { AuthController } from "./auth/controller";
import { browserStore } from "./auth/storage";

/**
 * The app's session and the API client that speaks for it. The session needs the client for the two unauthenticated login calls
 * and the client needs the session for credentials; the arrow functions defer the lookup to call time.
 */
export const auth = new AuthController({
  loadConfig: () => fetchAuthConfig(api),
  requestDevToken: (body) => requestDevToken(api, body),
  store: browserStore(),
  redirect: (url) => window.location.assign(url),
  origin: window.location.origin,
  currentPath: () => window.location.pathname + window.location.search + window.location.hash,
});

export const api = createApiClient({ credentials: auth });
