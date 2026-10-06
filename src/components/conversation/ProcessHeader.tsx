import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "../../lib/activity";
import { cn } from "../../lib/cn";
import type { AttemptStatus } from "../../lib/taskEvents";

/** The seconds a reply has been going, ticking. The timer lives here so only this leaf re-renders each second. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const start = new Date(since).getTime();
  return <>{formatDuration(Number.isNaN(start) ? 0 : now - start)}</>;
}

interface ProcessHeaderProps {
  readonly status: AttemptStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  /** The reply has put something out (a step or words) beyond thinking. */
  readonly working: boolean;
  /** There is a process to fold: steps, narration, or (developer mode) thinking. */
  readonly expandable: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly controls: string;
}

/**
 * The quiet line that starts an agent reply: 正在思考 → 正在处理 12s → 已处理 1m 41s (or 你在 1m 2s 后停止了).
 * Once the reply is over and has a process, the line folds and unfolds it.
 */
export function ProcessHeader({ status, startedAt, finishedAt, working, expandable, open, onToggle, controls }: ProcessHeaderProps) {
  const running = status === "running";
  const span = finishedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : Number.NaN;
  const took = Number.isNaN(span) ? "" : formatDuration(span);
  let label: React.ReactNode;
  if (running) label = working ? <>正在处理 <Elapsed since={startedAt} /></> : "正在思考";
  else if (status === "parked_approval") label = "等待你的确认";
  else if (status === "parked_input") label = "等待你的回答";
  else if (status === "cancelled") label = took ? `你在 ${took} 后停止了` : "你停止了";
  else label = took ? `已处理 ${took}` : "已处理";
  const settled = status === "completed" || status === "failed" || status === "cancelled";
  const text = <span data-testid="process-label" className={cn(running && "shimmer-text")}>{label}</span>;
  return (
    <div data-testid="process-header" data-open={settled && expandable ? String(open) : undefined} className="border-b border-border pb-1.5 text-small text-muted-foreground">
      {settled && expandable ? (
        <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className="inline-flex items-center gap-1 rounded-control hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {text}
          <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
        </button>
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}
