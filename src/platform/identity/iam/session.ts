/**
 * IAM 会话存储：与 baize-frontend 基座（lib/utils/iam-session-storage.ts）同 key 同机制——
 * localStorage 主存储 + cookie 镜像，双写双清（照 netflow apps/web/app/lib/iam-session.ts）。
 * 嵌入态（生产同域）与基座共享同一份 localStorage；dev 双端口下 localStorage 隔离，
 * 靠 cookie 镜像读取基座会话。
 */

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** The IAM user the base keeps beside the token; its id identifies the signed-in account. */
export interface StoredIamUser {
  readonly id: string;
  readonly [key: string]: unknown;
}

export function readStoredIamUser(): StoredIamUser | null {
  try {
    const parsed = JSON.parse(localStorage.getItem("user") ?? "null") as StoredIamUser | null;
    return parsed && typeof parsed === "object" && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export interface IamSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: StoredIamUser;
}

export function saveIamSession(session: IamSession): void {
  try {
    localStorage.setItem("token", session.accessToken);
    localStorage.setItem("refresh_token", session.refreshToken);
    localStorage.setItem("user", JSON.stringify(session.user));
  } catch {
    // Storage may be unavailable in private or sandboxed contexts; the cookie mirror still carries the token.
  }
  writeCookie(ACCESS_TOKEN_COOKIE, session.accessToken);
  writeCookie(REFRESH_TOKEN_COOKIE, session.refreshToken);
}

export function clearIamSession(): void {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
  } catch {
    // See saveIamSession.
  }
  clearCookie(ACCESS_TOKEN_COOKIE);
  clearCookie(REFRESH_TOKEN_COOKIE);
}

/**
 * 当前会话的 access token：优先 localStorage（基座主存储，生产同域时与基座共享、
 * 随基座刷新保持新鲜），回落 cookie 镜像（dev 双端口下唯一能跨 origin 读到基座会话的通道）。
 */
export function getSessionToken(): string | null {
  try {
    const token = localStorage.getItem("token");
    if (token) return token;
  } catch {
    // Fall through to the cookie mirror.
  }
  return readCookie(ACCESS_TOKEN_COOKIE);
}
