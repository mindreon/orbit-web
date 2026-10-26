import { ApiError } from "../../../api/errors";
import type { StoredIamUser } from "./session";

/**
 * baize IAM 浏览器侧接口：路径与基座一致（/iam/api/v1），dev 走 vite 代理（/iam 规则）、
 * 生产走边缘同域反代。请求/响应形状照 netflow apps/web/app/lib/api/iam.ts：
 * 信封 {code, error?, message, data}，code !== 0 即失败；登录 data = {accessToken, refreshToken, user}。
 */

interface IamEnvelope<T> {
  readonly code: number;
  readonly error?: string;
  readonly message: string;
  readonly data: T;
}

export interface IamLoginData {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: StoredIamUser;
}

export async function iamLogin(input: { username: string; password: string }): Promise<IamLoginData> {
  let response: Response;
  try {
    response = await fetch("/iam/api/v1/auth/login", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (cause) {
    throw new ApiError(0, { code: "NETWORK", message: "连不上登录服务，请检查网络后重试。", retryable: true, details: cause });
  }
  const body = await response.json().catch(() => null) as IamEnvelope<IamLoginData> | null;
  if (!response.ok || !body || body.code !== 0 || !body.data?.accessToken) {
    throw new ApiError(response.status, { code: "IAM_LOGIN_FAILED", message: body?.message || "登录失败", retryable: false });
  }
  return body.data;
}
