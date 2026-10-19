import { Button } from "../ui/Button";
export function StreamStatus({ status, attempt, onReconnect }: { status: "connecting" | "live" | "reconnecting" | "rebuilding" | "ended" | "fatal"; attempt?: number; onReconnect?: () => void }) {
  const labels = { connecting: "正在连接…", live: "实时", reconnecting: `正在重新连接（${attempt ?? 1}）`, rebuilding: "正在重建…", ended: "已结束", fatal: "实时更新已断开" };
  return <div role="status" className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">{labels[status]}{status === "fatal" && onReconnect ? <Button size="sm" onClick={onReconnect}>重新连接</Button> : null}</div>;
}
