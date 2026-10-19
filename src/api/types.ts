import type { components } from "./schema";

export type S = components["schemas"];
export type Principal = S["Principal"];
export type Tenant = S["Tenant"];
export type Me = S["Me"];
export type Workspace = S["Workspace"];
export type Run = S["Run"];
export type Session = S["Session"];
export type Message = S["Message"];
export type InteractionRequest = S["InteractionRequest"];
export type Decision = S["Decision"];
export type Asset = S["Asset"];
export type AssetKind = S["AssetKind"];
export type EntryKind = S["EntryKind"];
export type AuthConfig = S["AuthConfig"];
export type DevTokenRequest = S["DevTokenInput"];
export type DevTokenResponse = S["DevToken"];
export type ErrorCode = S["Error"]["error"]["code"];
