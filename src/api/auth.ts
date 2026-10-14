/*
 * Hand-written minimal types for the login convention (implementation plan §5). WP9 replaces them with imports from the
 * generated `schema.d.ts` once control's openapi.yaml exists; until then this is the only place a `/v1` shape is written by hand.
 */
import type { ApiClient } from "./client";

/** `GET /v1/auth/config`: how this deployment signs people in. */
export type AuthConfig =
  | {
      readonly mode: "oidc";
      readonly issuer: string;
      readonly client_id: string;
      readonly scopes?: readonly string[];
      /** Sent as the `audience` authorization parameter when the IdP needs it to issue a token control accepts. */
      readonly audience?: string;
    }
  | { readonly mode: "dev" };

/** `POST /v1/auth/dev/token`: only exists when control runs with `ORBIT_AUTH_MODE=dev`. */
export interface DevTokenRequest {
  readonly email: string;
  readonly display_name?: string;
}

export interface DevTokenResponse {
  readonly access_token: string;
  /** Seconds. */
  readonly expires_in: number;
}

export interface Principal {
  readonly id: string;
  readonly kind: "user" | "service";
  readonly email: string;
  readonly display_name: string;
}

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

/** `GET /v1/me`. `current_tenant` is the id of the tenant `X-Orbit-Tenant` selected (control's default when the header is absent). */
export interface Me {
  readonly principal: Principal;
  readonly tenants: readonly Tenant[];
  readonly current_tenant: string;
  readonly roles: readonly string[];
}

export const fetchAuthConfig = (api: ApiClient, signal?: AbortSignal) => api.get<AuthConfig>("/auth/config", { authenticated: false, signal });

export const requestDevToken = (api: ApiClient, body: DevTokenRequest) => api.post<DevTokenResponse>("/auth/dev/token", body, { authenticated: false });

export const fetchMe = (api: ApiClient, signal?: AbortSignal) => api.get<Me>("/me", { signal });
