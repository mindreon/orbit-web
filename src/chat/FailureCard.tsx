import { RotateCcw, TriangleAlert } from "lucide-react";
import type { TurnErrorCode } from "../lib/events/activity";

/** Copy is keyed by errorCode only. The event's message text is not shown. */
const FAILURE_TEXT: Record<TurnErrorCode, string> = {
  timeout: "这一轮等了太久还没有完成，已经停下。",
  rate_limited: "模型服务现在太忙，这一轮被限流了。",
  provider_error: "模型服务返回了错误，这一轮没有完成。",
  auth: "模型服务的凭据无效或已过期。请联系管理员处理，重试不会有帮助。",
  config: "模型或运行环境的配置有问题。请联系管理员处理，重试不会有帮助。",
};

const NO_RETRY: ReadonlySet<TurnErrorCode> = new Set(["auth", "config"]);

export function canRetry(errorCode: TurnErrorCode, retryable: boolean) {
  return retryable && !NO_RETRY.has(errorCode);
}

export function FailureCard({
  errorCode,
  retryable,
  retryText,
  disabled,
  onRetry,
}: {
  errorCode: TurnErrorCode;
  retryable: boolean;
  retryText: string | null;
  disabled: boolean;
  onRetry: (text: string) => void;
}) {
  const showRetry = canRetry(errorCode, retryable) && Boolean(retryText);
  return (
    <div role="alert" data-testid="failure-card" data-code={errorCode} className="border-destructive/30 bg-destructive/5 max-w-2xl rounded-lg border px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <TriangleAlert className="text-destructive mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#222]">这一轮没有完成</p>
          <p className="mt-0.5 text-xs leading-5 text-[#555]">{FAILURE_TEXT[errorCode]}</p>
          <p className="mt-1 font-mono text-[11px] text-[#999]">错误码 {errorCode}</p>
        </div>
        {showRetry ? (
          <button
            type="button"
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-[#f6f6f7] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => retryText && onRetry(retryText)}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            重试
          </button>
        ) : null}
      </div>
    </div>
  );
}
