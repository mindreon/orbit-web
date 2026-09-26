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
}

/** 有 HTTP 响应但是非 2xx。没有响应（断网、超时、fetch 被拒绝）用 kind "unreachable"。 */
export class RoomRequestError extends Error {
  readonly kind: "unreachable" | "http";
  readonly status: number | null;
  readonly serverMessage: string;
  readonly code: string;

  constructor(kind: "unreachable" | "http", status: number | null, serverMessage: string, code = "") {
    super(serverMessage.trim() || (status ? `请求失败（${status}）` : "Failed to fetch"));
    this.name = "RoomRequestError";
    this.kind = kind;
    this.status = status;
    this.serverMessage = serverMessage.trim();
    this.code = code;
  }
}

export const WORKER_START_FAILURE = "任务已创建，但启动失败，刷新后可以在任务列表里看到它";

/** 后端接受了连接但一直不回时，到这个时间就放弃。单位是毫秒。 */
export const ROOM_REQUEST_TIMEOUT_MS = 15000;

/** 调用方自己取消（例如组件卸载时 abort）时为 true。超时是 TimeoutError，不会算进来。 */
export function isCallerAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export type RoomCreateAlert = {
  message: string;
  retry: boolean;
};

export function describeRoomFailure(action: string, error: unknown) {
  if (error instanceof RoomRequestError && error.kind === "http") {
    const status = error.status != null ? `（HTTP ${error.status}）` : "";
    const server = error.serverMessage;
    return server ? `${action}：后端返回错误${status}：${server}` : `${action}：后端返回错误${status}。`;
  }
  return `${action}：后端连不上（网络错误或超时）。请稍后重试。`;
}

/** 502 且 code 为 WORKER_ERROR：writeErr 只有 code 和 message，没有房间 id。 */
export function roomCreateAlert(error: unknown): RoomCreateAlert {
  if (error instanceof RoomRequestError && error.kind === "http" && error.status === 502 && error.code === "WORKER_ERROR") {
    return { message: WORKER_START_FAILURE, retry: false };
  }
  return { message: describeRoomFailure("创建任务失败", error), retry: true };
}

function readErrorBody(body: unknown) {
  if (!body || typeof body !== "object") return { message: "", code: "" };
  const record = body as ErrorBody;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  return { message, code };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const callerSignal = init?.signal;
  // 没有调用方 signal 时，直接用 AbortSignal.timeout。
  // 有调用方 signal 时要两边一起听。不用 AbortSignal.any：Safari 16.4 还没有它。
  // 改用自己的 AbortController，调用方取消或 setTimeout 到点都会 abort，finally 里清掉计时器。
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };
  let signal: AbortSignal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener("abort", onCallerAbort);
    timer = setTimeout(() => {
      controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }, ROOM_REQUEST_TIMEOUT_MS);
    signal = controller.signal;
  } else {
    signal = AbortSignal.timeout(ROOM_REQUEST_TIMEOUT_MS);
  }

  try {
    const response = await fetch(path, {
      ...init,
      signal,
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
      const parsed = readErrorBody(body);
      throw new RoomRequestError("http", response.status, parsed.message, parsed.code);
    }
    return body as T;
  } catch (error) {
    if (error instanceof RoomRequestError) throw error;
    // 调用方主动取消：原样抛出，不换成「后端连不上」，这样界面不会弹出失败提示。
    if (callerSignal?.aborted && isCallerAbort(error)) throw error;
    // TimeoutError（到点放弃）和 AbortError（超时信号中断）都算连不上，和断网一样可以重试。
    const detail = error instanceof Error ? error.message : "";
    throw new RoomRequestError("unreachable", null, detail);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
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
