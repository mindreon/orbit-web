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
  return api<{ room: Room }>(`/v1/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
