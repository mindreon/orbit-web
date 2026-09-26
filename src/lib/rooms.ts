import type { PermissionPreset, RoomState } from "../model";

export interface Room {
  id: string;
  kind: string;
  title: string;
  state: RoomState;
  permissionPreset: PermissionPreset;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  role: string;
  text: string;
  createdAt: string;
  type?: string;
}

export interface Approval {
  id: string;
  roomId: string;
  toolName?: string;
  reason?: string;
  status: string;
  decision?: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  sequence: number;
  type: string;
  roomId: string;
  role?: string;
  text?: string;
  toolName?: string;
  reason?: string;
  status?: string;
  occurredAt: string;
}

interface ErrorBody {
  message?: unknown;
  code?: unknown;
  id?: unknown;
  roomId?: unknown;
}

/** 有 HTTP 响应但是非 2xx。没有响应（断网、超时、fetch 被拒绝）用 kind "unreachable"。 */
export class RoomRequestError extends Error {
  readonly kind: "unreachable" | "http";
  readonly status: number | null;
  readonly serverMessage: string;
  readonly code: string;
  /** 只在错误 JSON 里真有 id / roomId 时才有值，不会从文案里猜。 */
  readonly roomId: string | null;

  constructor(kind: "unreachable" | "http", status: number | null, serverMessage: string, code = "", roomId: string | null = null) {
    super(serverMessage.trim() || (status ? `请求失败（${status}）` : "Failed to fetch"));
    this.name = "RoomRequestError";
    this.kind = kind;
    this.status = status;
    this.serverMessage = serverMessage.trim();
    this.code = code;
    this.roomId = roomId;
  }
}

export const WORKER_START_FAILURE = "任务已创建，但启动失败，刷新后可以在任务列表里看到它";

export type RoomCreateAlert = {
  message: string;
  retry: boolean;
  roomId: string | null;
};

export function describeRoomFailure(action: string, error: unknown) {
  if (error instanceof RoomRequestError && error.kind === "http") {
    const status = error.status != null ? `（HTTP ${error.status}）` : "";
    const server = error.serverMessage;
    return server ? `${action}：后端返回错误${status}：${server}` : `${action}：后端返回错误${status}。`;
  }
  return `${action}：后端连不上（网络错误或超时）。请稍后重试。`;
}

/** 502 且 code 为 WORKER_ERROR：房间已在服务端写下，但响应体不一定带 id。 */
export function roomCreateAlert(error: unknown): RoomCreateAlert {
  if (error instanceof RoomRequestError && error.kind === "http" && error.status === 502 && error.code === "WORKER_ERROR") {
    return { message: WORKER_START_FAILURE, retry: false, roomId: error.roomId };
  }
  return { message: describeRoomFailure("创建任务失败", error), retry: true, roomId: null };
}

function readErrorBody(body: unknown) {
  if (!body || typeof body !== "object") return { message: "", code: "", roomId: null as string | null };
  const record = body as ErrorBody;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const rawId = typeof record.roomId === "string" ? record.roomId : typeof record.id === "string" ? record.id : "";
  const roomId = rawId.trim() ? rawId.trim() : null;
  return { message, code, roomId };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    throw new RoomRequestError("unreachable", null, detail);
  }
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
    throw new RoomRequestError("http", response.status, parsed.message, parsed.code, parsed.roomId);
  }
  return body as T;
}

export function listRooms() {
  return api<{ items: Room[] | null }>("/v1/rooms");
}

export function createRoom(input: { title: string; permissionPreset: PermissionPreset }) {
  return api<Room>("/v1/rooms", {
    method: "POST",
    body: JSON.stringify({
      kind: "solo",
      title: input.title,
      permissionPreset: input.permissionPreset,
    }),
  });
}

export function listMessages(roomId: string) {
  return api<{ items: ChatMessage[] | null }>(`/v1/rooms/${encodeURIComponent(roomId)}/messages`);
}

export function postMessage(roomId: string, message: string) {
  return api<{ room: Room; approval?: Approval | null }>(`/v1/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function getRoom(roomId: string) {
  return api<Room>(`/v1/rooms/${encodeURIComponent(roomId)}`);
}

export function listActivity(roomId: string) {
  return api<{ items: ActivityEvent[] | null }>(`/v1/rooms/${encodeURIComponent(roomId)}/activity`);
}

export function listApprovals() {
  return api<{ items: Approval[] | null }>("/v1/approvals");
}

export function decideApproval(approvalId: string, decision: "allow" | "reject") {
  return api<Approval>(`/v1/approvals/${encodeURIComponent(approvalId)}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function abortRoom(roomId: string) {
  return api<{ aborted: boolean }>(`/v1/rooms/${encodeURIComponent(roomId)}/abort`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function steerRoom(roomId: string, instruction: string) {
  return api<{ accepted: boolean }>(`/v1/rooms/${encodeURIComponent(roomId)}/steer`, {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}
