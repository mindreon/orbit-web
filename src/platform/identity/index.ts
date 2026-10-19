import type { ComponentType } from "react";
import type { Credentials } from "../../api/client";

/** Replace the control implementation here; consumers depend only on this contract. */
export interface IdentityAdapter {
  subscribe(listener: () => void): () => void;
  snapshot(): { status: "initializing" | "anonymous" | "authenticated"; error: string | null };
  credentials: Credentials;
  setTenant(tenantId: string | null): void;
  signOut(): Promise<void>;
  initialize(): Promise<void>;
  readonly SignInPage: ComponentType;
  readonly CallbackPage?: ComponentType;
}

export { controlIdentity as defaultIdentity } from "./control/adapter";
export { IdentityProvider } from "./provider";
export { useIdentity, type IdentityValue } from "./context";
export { RequireIdentity } from "./RequireIdentity";
