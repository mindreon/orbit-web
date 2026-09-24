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
  message?: string;
  code?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
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
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as ErrorBody).message ?? "")
        : "";
    throw new Error(message || `请求失败（${response.status}）`);
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
