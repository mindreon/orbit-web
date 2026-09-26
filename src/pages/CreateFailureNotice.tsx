import { Link } from "react-router";
import type { RoomCreateAlert } from "../lib/rooms";

export function CreateFailureNotice({
  alert,
  retryDisabled,
  onRetry,
}: {
  alert: RoomCreateAlert;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mt-3 flex items-start gap-3 rounded-lg border border-[#f0d0d0] bg-[#fff6f6] px-3 py-2 text-sm text-[#c04545]">
      <p className="min-w-0 flex-1 text-left">
        {alert.message}
        {alert.roomId ? (
          <>
            {" "}
            <Link to={`/task/${encodeURIComponent(alert.roomId)}`} className="underline">
              查看该任务
            </Link>
          </>
        ) : null}
      </p>
      {alert.retry ? (
        <button
          type="button"
          className="shrink-0 rounded-lg bg-[#1a1a1a] px-3 py-1 text-xs text-white disabled:opacity-40"
          disabled={retryDisabled}
          onClick={onRetry}
        >
          重试
        </button>
      ) : null}
    </div>
  );
}
