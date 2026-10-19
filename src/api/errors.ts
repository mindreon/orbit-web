import { errorMessage } from "./errorMessages";

/** The error body every `/v1` refusal carries: `{"error": {code, message, retryable, details}}` (design §9.1). */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

/** The server answered with a non-2xx status. `retryable` is the server's own verdict, or a guess from the status when the body is not the error shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `请求失败（HTTP ${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
    this.details = body.details;
  }

  /** Reads the body of a failed response. A proxy's HTML page or an empty body still yields an ApiError, with a status-derived code. */
  static async fromResponse(response: Response): Promise<ApiError> {
    const text = await response.text().catch(() => "");
    const parsed = parseBody(text);
    return new ApiError(response.status, parsed ?? { code: `HTTP_${response.status}`, message: "", retryable: isTransientStatus(response.status) });
  }
}

/** No response at all: offline, DNS, connection reset, CORS. Always worth another try. */
export class NetworkError extends Error {
  readonly retryable = true;

  constructor(cause: unknown) {
    super("网络错误", { cause });
    this.name = "NetworkError";
  }
}

/** Gateway-style failures and throttling, which a retry can fix. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseBody(text: string): ApiErrorBody | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const error = (value as { error?: unknown } | null)?.error;
  if (typeof error !== "object" || error === null) return null;
  const { code, message, retryable, details } = error as Record<string, unknown>;
  if (typeof code !== "string") return null;
  return { code, message: typeof message === "string" ? message : "", retryable: retryable === true, details };
}

/** Whether trying the same request again can succeed. Anything that is not an API or network failure (a bug, an abort) is not retried. */
export function isRetryable(error: unknown): boolean {
  return (error instanceof ApiError || error instanceof NetworkError) && error.retryable;
}

/** A user-facing sentence for a failed action. */
export function describeFailure(action: string, error: unknown): string {
  if (error instanceof ApiError) return `${action}：${errorMessage(error.code, error.message)}`;
  if (error instanceof NetworkError) return `${action}：连不上服务器，请检查网络后重试。`;
  return `${action}：${error instanceof Error ? error.message : "未知错误"}`;
}
