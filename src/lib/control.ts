export const CONTROL_URL =
  process.env.NEXT_PUBLIC_CONTROL_URL ?? "http://127.0.0.1:8080";

export type Room = {
  id: string;
  kind: string;
  title: string;
  state: string;
  sessionId?: string;
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
  createRoom: (title: string) =>
    api<Room>("/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ kind: "solo", title }),
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
  listApprovals: () => api<{ items: Approval[] }>("/v1/approvals"),
  decide: (id: string, decision: "allow" | "reject") =>
    api<Approval>(`/v1/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};
