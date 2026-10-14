/** The slice of `Storage` the auth module uses; `sessionStorage` satisfies it and tests pass a Map-backed one. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Tokens held by the page. `expiresAt` is a millisecond timestamp. */
export interface TokenSet {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken?: string;
  readonly idToken?: string;
}

export const STORAGE_KEYS = {
  /** One page load after explicit OIDC logout must stay on the login page. */
  loggedOut: "orbit.oidc.logged-out",
  /** The authorization request in flight: needed again when the browser comes back from the IdP. */
  oidcPending: "orbit.oidc.pending",
  /** When the last code exchange succeeded, to tell "token expired" from "control rejects what this IdP issues". */
  oidcLoginAt: "orbit.oidc.login-at",
  /** Dev mode only, see controller.ts. */
  devSession: "orbit.dev.session",
  /** The selected tenant id. Not a secret. */
  tenant: "orbit.tenant",
} as const;

/** `sessionStorage` can throw (blocked site data, private windows); the app then simply forgets across reloads. */
export function browserStore(): KeyValueStore {
  const guard = <T>(run: () => T, fallback: T): T => {
    try {
      return run();
    } catch {
      return fallback;
    }
  };
  return {
    getItem: (key) => guard(() => sessionStorage.getItem(key), null),
    setItem: (key, value) => guard(() => sessionStorage.setItem(key, value), undefined),
    removeItem: (key) => guard(() => sessionStorage.removeItem(key), undefined),
  };
}
