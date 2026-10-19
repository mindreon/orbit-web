import type { Session } from "../../api/types";
export function sidebarStatus(session: Pick<Session, "id" | "status">, pending: readonly { sessionId: string }[]): "waiting" | "running" | null {
  return pending.some((item) => item.sessionId === session.id) ? "waiting" : session.status === "active" ? "running" : null;
}
