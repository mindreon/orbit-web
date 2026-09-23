/**
 * Base URL for orbit-control.
 * - unset → local `next dev` default (control on :8080)
 * - empty string → same-origin (Compose + Caddy on one port)
 * - absolute URL → direct control (bypass gateway)
 */
export const CONTROL_URL = (() => {
  const raw = process.env.NEXT_PUBLIC_CONTROL_URL;
  if (raw === undefined) return "http://127.0.0.1:8080";
  return raw.replace(/\/$/, "");
})();

export type PermissionPreset = "workspace-write" | "read-only" | "danger-full-access";

export function permissionLabel(preset: string): string {
  if (preset === "read-only") return "只读";
  if (preset === "workspace-write") return "工作区可写";
  if (preset === "danger-full-access") return "完全访问";
  return preset;
}

export type Room = {
  id: string;
  kind: "solo" | "collab";
  title: string;
  state: string;
  permissionPreset: PermissionPreset;
  runtime: {
    kernel: "dsh";
    protocol: "acp";
    isolation: "process";
  };
  sessionId?: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  role: string;
  text: string;
  createdAt: string;
};

export type Approval = {
  id: string;
  roomId: string;
  toolName: string;
  reason?: string;
  status: string;
  decision?: string;
};

export type ActivityEvent = {
  id: string;
  sequence: number;
  type:
    | "session.status"
    | "assistant.message"
    | "tool.call"
    | "tool.result"
    | "approval.asked"
    | "agent.started"
    | "agent.finished"
    | "usage"
    | "room.steered";
  roomId: string;
  sessionId?: string;
  turnId?: string;
  source: "control" | "worker";
  runtime?: "dsh";
  protocol?: "acp";
  role?: string;
  text?: string;
  toolName?: string;
  callId?: string;
  approvalId?: string;
  approvalRequestId?: string;
  reason?: string;
  status?: string;
  permissionPreset?: PermissionPreset;
  occurredAt: string;
};

export type CreateRoomInput = {
  title: string;
  kind: "solo" | "collab";
  permissionPreset: PermissionPreset;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CONTROL_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const control = {
  health: () => api<{ status: string }>("/health"),
  listRooms: () => api<{ items: Room[] }>("/v1/rooms"),
  createRoom: (input: CreateRoomInput) =>
    api<Room>("/v1/rooms", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getRoom: (id: string) => api<Room>(`/v1/rooms/${id}`),
  listMessages: (id: string) =>
    api<{ items: ChatMessage[] }>(`/v1/rooms/${id}/messages`),
  postMessage: (id: string, message: string) =>
    api<{ room: Room; approval: Approval | null }>(`/v1/rooms/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  abortRoom: (id: string) =>
    api<{ aborted: boolean }>(`/v1/rooms/${id}/abort`, { method: "POST" }),
  steerRoom: (id: string, instruction: string) =>
    api<{ accepted: boolean }>(`/v1/rooms/${id}/steer`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),
  listActivity: (id: string) =>
    api<{ items: ActivityEvent[] }>(`/v1/rooms/${id}/activity`),
  listApprovals: () => api<{ items: Approval[] }>("/v1/approvals"),
  decide: (id: string, decision: "allow" | "reject") =>
    api<Approval>(`/v1/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};
