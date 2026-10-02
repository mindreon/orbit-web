import { api } from "./api";
import type { TaskConfigInput } from "./taskConfig";
export type TaskStatus =
  | "CREATED" | "PLANNING" | "RUNNING" | "WAITING" | "PAUSED"
  | "PAUSED_NEEDS_REVIEW" | "TAKEN_OVER" | "COMPLETED" | "FAILED" | "CANCELLED";

export type Task = {
  task_id: string;
  tenant_id: string;
  workflow_id: string;
  title: string;
  goal: string;
  mode: string;
  status: TaskStatus;
  profile: string;
  plan_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  budgets: Record<string, unknown>;
  usage: Record<string, unknown>;
  pending_approvals?: string[];
};

export type TaskEvent = {
  /** Durable events are numbered; an ephemeral one has seq 0 and `after_seq`, the durable event it follows. */
  seq: number;
  after_seq?: number;
  event_id: string;
  task_id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  entity?: { kind: string; id: string; version: number };
};

export type ArtifactManifest = {
  manifest_id: string;
  task_id: string;
  attempt_id?: string;
  entries: Array<Record<string, unknown>>;
  manifest_hash?: string;
  created_at: string;
};

export type Profile = { profile_id: string; version: number; ref: string; spec: Record<string, unknown>; created_at: string };

export type Plan = {
  plan_version: number;
  hash: string;
  nodes: Array<{
    node_id: string;
    type: string;
    title: string;
    status: string;
    depends_on: string[];
    workspace_access: string;
    owner_profile: string;
    frozen: boolean;
    current_attempt_id?: string;
    attempt_count: number;
  }>;
  edges: Array<{ from: string; to: string }>;
};

export async function listTasks(): Promise<Task[]> {
  const body = await api<{ items: Task[] }>("/v1/tasks");
  return body.items ?? [];
}

export function createTask(input: { title: string; goal: string; profile?: string; config?: TaskConfigInput }): Promise<Task> {
  return api<Task>("/v1/tasks", { method: "POST", body: JSON.stringify(input) });
}

export function getTask(id: string): Promise<Task> { return api<Task>(`/v1/tasks/${encodeURIComponent(id)}`); }
export function getPlan(id: string): Promise<Plan> { return api<Plan>(`/v1/tasks/${encodeURIComponent(id)}/plan`); }
export function listTaskArtifacts(id: string): Promise<ArtifactManifest[]> { return api<{ items?: ArtifactManifest[] }>(`/v1/tasks/${encodeURIComponent(id)}/artifacts`).then((body) => body.items ?? []); }
export function getArtifactURL(manifestId: string, name: string): Promise<string> {
  return api<{ url: string }>(`/v1/artifacts/${encodeURIComponent(manifestId)}/url?name=${encodeURIComponent(name)}`).then((body) => body.url);
}
export function listProfiles(): Promise<Profile[]> { return api<{ items: Profile[] }>("/v1/profiles").then((body) => body.items); }

export function sendTaskMessage(id: string, text: string, delivery: "queue" | "interrupt" = "queue") {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text, delivery }) });
}

export function controlTask(id: string, action: "pause" | "resume" | "stop" | "cancel" | "takeover" | "handback") {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/control`, { method: "POST", body: JSON.stringify({ action }) });
}

/** `always`: with approve, also allow what the approval offered for the rest of the task. */
export function decideTaskApproval(id: string, approvalId: string, decision: "approve" | "reject", always = false) {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/approvals/${encodeURIComponent(approvalId)}`, { method: "POST", body: JSON.stringify({ decision, always }) });
}

export type StreamState = "connected" | "reconnecting";

/** EventSource resumes from the last durable event id by itself; ephemeral frames carry no id. */
export function subscribeTaskEvents(id: string, onEvent: (event: TaskEvent) => void, onState: (state: StreamState) => void): () => void {
  const source = new EventSource(`/v1/tasks/${encodeURIComponent(id)}/events`);
  source.onopen = () => onState("connected");
  source.onmessage = (message) => onEvent(JSON.parse(message.data) as TaskEvent);
  source.onerror = () => onState("reconnecting");
  return () => source.close();
}
