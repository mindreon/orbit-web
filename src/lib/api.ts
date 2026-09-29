/** 有 HTTP 响应但是非 2xx。没有响应（断网、超时、fetch 被拒绝）用 kind "unreachable"。 */
export class ApiError extends Error {
  readonly kind: "unreachable" | "http";
  readonly status: number | null;
  readonly serverMessage: string;
  readonly code: string;

  constructor(kind: "unreachable" | "http", status: number | null, serverMessage: string, code = "") {
    super(serverMessage.trim() || (status ? `请求失败（${status}）` : "Failed to fetch"));
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.serverMessage = serverMessage.trim();
    this.code = code;
  }
}

/** 后端接受了连接但一直不回时，到这个时间就放弃。单位是毫秒。 */
export const REQUEST_TIMEOUT_MS = 15000;

type ApiInit = RequestInit & {
  /** 这次请求最多等多少毫秒。不传则用 REQUEST_TIMEOUT_MS，0 表示不限时。 */
  timeoutMs?: number;
};

/** 调用方自己取消（例如组件卸载时 abort）时为 true。超时是 TimeoutError，不会算进来。 */
export function isCallerAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function describeFailure(action: string, error: unknown) {
  if (error instanceof ApiError && error.kind === "http") {
    const status = error.status != null ? `（HTTP ${error.status}）` : "";
    const server = error.serverMessage;
    return server ? `${action}：后端返回错误${status}：${server}` : `${action}：后端返回错误${status}。`;
  }
  return `${action}：后端连不上（网络错误或超时）。请稍后重试。`;
}

function readErrorBody(body: unknown) {
  if (!body || typeof body !== "object") return { message: "", code: "" };
  const record = body as { message?: unknown; code?: unknown };
  return {
    message: typeof record.message === "string" ? record.message.trim() : "",
    code: typeof record.code === "string" ? record.code.trim() : "",
  };
}

/** 普通 JSON 请求。SSE 是一直开着的流，不走这里，见 lib/useTaskStream.ts。 */
export async function api<T>(path: string, init?: ApiInit): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const callerSignal = fetchInit.signal;
  // 不用 AbortSignal.any：Safari 16.4 还没有它。调用方取消或计时到点都由同一个 controller 中止。
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (callerSignal?.aborted) controller.abort(callerSignal.reason);
  else callerSignal?.addEventListener("abort", onCallerAbort);
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), timeoutMs);
  }

  try {
    const response = await fetch(path, {
      ...fetchInit,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(fetchInit.headers ?? {}) },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const parsed = readErrorBody(body);
      throw new ApiError("http", response.status, parsed.message, parsed.code);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // 调用方主动取消：原样抛出，界面不弹失败提示。
    if (callerSignal?.aborted && isCallerAbort(error)) throw error;
    throw new ApiError("unreachable", null, error instanceof Error ? error.message : "");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
