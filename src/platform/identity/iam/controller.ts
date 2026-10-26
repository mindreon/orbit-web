import type { AuthConfig } from "../../../api/auth";
import type { Credentials } from "../../../api/client";
import { isEmbeddedInWujie, wujieMainReturnPath, wujieNavigate } from "../../embed";
import { STORAGE_KEYS, browserStore, type KeyValueStore } from "../storage";
import { iamLogin } from "./api";
import { clearIamSession, getSessionToken, readStoredIamUser, saveIamSession } from "./session";

export interface IamSnapshot {
  readonly status: "initializing" | "anonymous" | "authenticated";
  readonly config: AuthConfig | null;
  readonly tenantId: string | null;
  readonly error: string | null;
}

/** `/baize/login` 的地址（嵌入态整页跳基座登录页，带回基座当前路径）。 */
export function baizeLoginHref(): string {
  const target = wujieMainReturnPath() ?? "/";
  return `/baize/login?${new URLSearchParams({ redirect: target }).toString()}`;
}

/**
 * `ORBIT_AUTH_MODE=iam` 下的浏览器会话：身份来自 baize IAM，token 按 netflow 同款机制
 * 存 localStorage（基座主存储）+ cookie 镜像，orbit-control 拿同一 token 调 IAM 校验。
 * 会话不属于 orbit：基座换账号或登出时（storage/focus/visibilitychange）这里重置并重取 /me。
 */
export class IamController implements Credentials {
  private snapshot: IamSnapshot;
  private userId: string | null = null;
  /** The token last adopted; a different stored token means the base switched accounts, even when the stored user id is unchanged. */
  private adoptedToken: string | null = null;
  /** A token control answered 401 for. recheck() must not adopt it again: that flips back to authenticated, /me 401s, and the expiry message disappears. */
  private rejectedToken: string | null = null;
  private following = false;
  private redirecting = false;
  private readonly listeners = new Set<() => void>();
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore = browserStore()) {
    this.store = store;
    this.snapshot = { status: "initializing", config: null, tenantId: store.getItem(STORAGE_KEYS.tenant), error: null };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): IamSnapshot => this.snapshot;

  private update(patch: Partial<IamSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** The dispatcher hands over once /auth/config said `mode: "iam"`. */
  activate(config: AuthConfig): void {
    this.userId = readStoredIamUser()?.id ?? null;
    this.adoptedToken = getSessionToken();
    this.rejectedToken = null;
    this.update({ config, status: this.adoptedToken ? "authenticated" : "anonymous", error: null });
    this.followSession();
  }

  /** Standalone sign-in: the same IAM endpoint the baize base login page uses. */
  async login(input: { username: string; password: string }): Promise<void> {
    const session = await iamLogin(input);
    saveIamSession(session);
    this.userId = session.user.id;
    this.adoptedToken = session.accessToken;
    this.rejectedToken = null;
    this.update({ status: "authenticated", error: null });
  }

  async signOut(): Promise<void> {
    clearIamSession();
    this.userId = null;
    this.adoptedToken = null;
    this.rejectedToken = null;
    this.store.removeItem(STORAGE_KEYS.tenant);
    this.update({ status: "anonymous", tenantId: null, error: null });
  }

  setTenant(tenantId: string | null): void {
    if (tenantId) this.store.setItem(STORAGE_KEYS.tenant, tenantId);
    else this.store.removeItem(STORAGE_KEYS.tenant);
    this.update({ tenantId });
  }

  // ---- Credentials (what the API client calls) -------------------------------------------------------------------------

  tenant = (): string | null => this.snapshot.tenantId;

  /** Read on every call: a base re-login refreshes the token without orbit noticing. */
  token = (): string | null => getSessionToken();

  unauthorized = (): void => {
    if (this.snapshot.status !== "authenticated" && !getSessionToken()) return;
    if (isEmbeddedInWujie()) {
      // 嵌入态登录由基座承载：整页跳基座登录页，带回基座当前路径。
      if (this.redirecting) return;
      this.redirecting = true;
      this.update({ status: "anonymous", tenantId: null });
      wujieNavigate(baizeLoginHref());
      return;
    }
    // Remember the token control refused, or the next focus recheck adopts it again and the expiry message is wiped.
    this.rejectedToken = getSessionToken();
    this.userId = readStoredIamUser()?.id ?? null;
    this.store.removeItem(STORAGE_KEYS.tenant);
    this.update({ status: "anonymous", tenantId: null, error: "登录已过期，请重新登录。" });
  };

  // ---- internals ------------------------------------------------------------------------------------------------------

  /** 基座换账号或登出（localStorage/cookie 变化或页面重新可见）时重置会话（照 netflow session-identity.ts）。 */
  private followSession(): void {
    if (this.following) return;
    this.following = true;
    const recheck = () => this.recheck();
    window.addEventListener("storage", recheck);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
  }

  private recheck(): void {
    if (document.visibilityState === "hidden") return;
    const token = getSessionToken();
    if (!token) {
      if (this.snapshot.status === "authenticated") void this.signOut();
      return;
    }
    // The server already rejected this exact token; adopting it again only flickers back to authenticated.
    if (token === this.rejectedToken) return;
    const userId = readStoredIamUser()?.id ?? null;
    const accountChanged = (userId !== null && this.userId !== null && userId !== this.userId) || (this.adoptedToken !== null && token !== this.adoptedToken);
    if (this.snapshot.status === "anonymous" || accountChanged) {
      this.userId = userId;
      this.adoptedToken = token;
      this.rejectedToken = null;
      // initializing 先行（IdentityProvider 清缓存/租户），下一拍恢复 authenticated 重取 /me。
      this.store.removeItem(STORAGE_KEYS.tenant);
      this.update({ status: "initializing", tenantId: null, error: null });
      queueMicrotask(() => this.update({ status: "authenticated" }));
    }
  }
}

export const iamAuth = new IamController();
