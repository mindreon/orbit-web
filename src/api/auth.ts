import type { ApiClient } from "./client";
import type { AuthConfig, DevTokenRequest, DevTokenResponse, Me } from "./types";
export type { AuthConfig, DevTokenRequest, DevTokenResponse, Me, Principal, Tenant } from "./types";

export const fetchAuthConfig = (api: ApiClient, signal?: AbortSignal) => api.get<AuthConfig>("/auth/config", { authenticated: false, signal });

export const requestDevToken = (api: ApiClient, body: DevTokenRequest) => api.post<DevTokenResponse>("/auth/dev/token", body, { authenticated: false });

export const fetchMe = (api: ApiClient, signal?: AbortSignal) => api.get<Me>("/me", { signal });
