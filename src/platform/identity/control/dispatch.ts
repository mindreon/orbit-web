import { createElement, useSyncExternalStore, type ComponentType } from "react";
import type { Credentials } from "../../../api/client";
import { auth as controlAuth, controlIdentity } from "./adapter";
import { ControlSignInProvider } from "./AuthProvider";
import { LoginPage } from "./LoginPage";
import { IamLoginPage } from "../iam/LoginPage";
import { iamAuth } from "../iam/controller";
import type { IdentityAdapter } from "../index";

/**
 * The app-wide identity adapter. `/auth/config` decides the implementation: `oidc`/`dev` run on control's AuthController,
 * `iam` runs on the baize IAM session (IamController). The control controller always loads the config, so the dispatch
 * adds no extra request; until the mode is known everything routes to control (the login page shows its loading state).
 */
class DispatchingController implements Credentials {
  private iam = false;

  constructor() {
    // controlAuth emits its snapshot (including the iam-mode "anonymous" one) before initialize()'s promise resolves,
    // and React's listeners are already attached by then. Activating here, inside control's own notification and ahead of
    // every listener registered afterwards, means no listener ever observes that snapshot: snapshot() serves iamAuth's.
    controlAuth.subscribe(() => {
      const config = controlAuth.getSnapshot().config;
      if (config?.mode === "iam" && !this.iam) {
        this.iam = true;
        iamAuth.activate(config);
      }
    });
  }

  initialize = (): Promise<void> => controlAuth.initialize();

  subscribe = (listener: () => void): (() => void) => {
    const offControl = controlAuth.subscribe(listener);
    const offIam = iamAuth.subscribe(listener);
    return () => {
      offControl();
      offIam();
    };
  };

  /** Keyed on the control snapshot, not `this.iam`: the flag flips inside the same notification that publishes the config. */
  snapshot = () => (controlAuth.getSnapshot().config?.mode === "iam" ? iamAuth.getSnapshot() : controlAuth.getSnapshot());

  token = () => (this.iam ? iamAuth.token() : controlAuth.token());
  tenant = () => (this.iam ? iamAuth.tenant() : controlAuth.tenant());
  unauthorized = () => (this.iam ? iamAuth.unauthorized() : controlAuth.unauthorized());
  setTenant = (tenantId: string | null) => (this.iam ? iamAuth.setTenant(tenantId) : controlAuth.setTenant(tenantId));
  signOut = () => (this.iam ? iamAuth.signOut() : controlAuth.logout());
}

const dispatcher = new DispatchingController();

function SignInPage() {
  const snapshot = useSyncExternalStore(dispatcher.subscribe, dispatcher.snapshot);
  if (snapshot.config?.mode === "iam") return createElement(IamLoginPage);
  return createElement(ControlSignInProvider, null, createElement(LoginPage));
}

export const identity: IdentityAdapter = {
  subscribe: dispatcher.subscribe,
  snapshot: dispatcher.snapshot,
  credentials: { token: dispatcher.token, tenant: dispatcher.tenant, unauthorized: dispatcher.unauthorized },
  initialize: () => dispatcher.initialize(),
  setTenant: dispatcher.setTenant,
  signOut: () => dispatcher.signOut(),
  SignInPage,
  CallbackPage: controlIdentity.CallbackPage as ComponentType | undefined,
};
