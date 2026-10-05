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

/**
 * 控制面拒绝一次任务操作时，响应体里的 `code` 就是运行时校验器给的类型（见 orbit-control 的 refusal.go）。
 * 这里是它们的中文说法；没收录的码照常显示后端给的原文。
 */
export const refusalText: Readonly<Record<string, string>> = {
  FROZEN_NODE: "这个步骤已经完成并冻结，不能再改动。",
  INVALID_TRANSITION: "任务现在的状态不允许这个操作，请刷新后再试。",
  STALE_ATTEMPT: "这次执行已经过期，请刷新后再试。",
  STALE: "页面上的内容已经过期，请刷新后再试。",
  VERSION_CONFLICT: "计划刚被别处改动，请刷新后再试。",
  TASK_CLOSED: "任务已经结束，不能再操作。",
  CONFIG_VERSION_CONFLICT: "任务的配置刚被改过，请刷新后再试。",
  UNKNOWN_APPROVAL: "找不到这个审批，它可能已经处理过。",
  APPROVAL_ALREADY_DECIDED: "这个审批已经处理过了。",
  UNKNOWN_PROFILE: "这个专家不在你的空间里，请换一个。",
  UNKNOWN_NODE: "找不到这个步骤。",
  NODE_RUNNING: "这个步骤正在执行：先接管任务，再手动完成。",
  SCHEMA_INVALID: "提交的内容格式不对。",
  POLICY_DENIED: "被策略拒绝，这个操作不被允许。",
  POLICY_VIOLATION: "违反了策略的限制。",
  NOT_ALLOWED: "这个操作不被允许。",
};

export function describeFailure(action: string, error: unknown) {
  if (error instanceof ApiError && error.kind === "http") {
    const refusal = refusalText[error.code];
    if (refusal) return `${action}：${refusal}`;
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
