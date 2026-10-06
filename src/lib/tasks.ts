import { api } from "./api";
import type { TaskConfigInput } from "./taskConfig";
import type { BudgetAmounts } from "./taskEvents";
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

/** What a node is inside a compiled SOP (contract v3 `sop_step`). */
export type SopStepInfo = {
  /** The SOP ref, `name@version`. */
  sop: string;
  role: "sop" | "step" | "approval_before" | "approval_after";
  total: number;
  step_id: string;
  index: number;
  subject: string;
};

/** What bounds one team stage (contract `TeamStageInfo`). */
export type TeamStageLimits = { max_members?: number; max_rounds?: number; max_messages?: number; max_hops?: number };

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
    /** The SOP node this node was compiled from; absent for ordinary nodes. */
    parent_node_id?: string | null;
    sop_step?: SopStepInfo | null;
    /** Which round of the leader's reviews this node is (set on a review node only). */
    review_round?: number | null;
    /** Which team member the node belongs to (set in a task with a team): the role id and what a person called it. */
    owner_role?: string | null;
    owner_label?: string | null;
    /** The limits of a team stage node. */
    team?: TeamStageLimits | null;
  }>;
  edges: Array<{ from: string; to: string }>;
  /** Completed nodes compacted out of the live plan (older plans and tasks have none). */
  archived?: PlanArchive | null;
};

export type PlanArchive = { count: number; hash: string; recent_titles?: string[] };

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

/** `mentions` are team role ids (no "@"); only a task with a team accepts them. */
export function sendTaskMessage(id: string, text: string, delivery: "queue" | "interrupt" = "queue", mentions: readonly string[] = []) {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text, delivery, ...(mentions.length > 0 ? { mentions } : {}) }) });
}

export function controlTask(id: string, action: "pause" | "resume" | "stop" | "cancel" | "takeover" | "handback") {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/control`, { method: "POST", body: JSON.stringify({ action }) });
}

/** 追加预算：`delta` 里写了的项加到任务的上限上。 */
export function grantTaskBudget(id: string, delta: BudgetAmounts) {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/budget`, { method: "POST", body: JSON.stringify({ delta }) });
}

/** 接管后由人手动完成一个节点；`reason` 记在节点的状态事件里。 */
export function completeTaskNode(id: string, nodeId: string, reason: string) {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/complete`, { method: "POST", body: JSON.stringify({ reason }) });
}

/** The workflow's answer when control passes it on; control may answer only `{accepted:true}`, so both fields can be missing. */
export type ProfileSwitchResult = { effective_attempt_no?: number; needs_approval?: boolean; approval_id?: string | null };

/** 把一个节点从下一次执行起换成另一位专家（`toProfile` 是专家的版本引用）。不在任务专家范围内的要先经审批。 */
export function switchNodeProfile(id: string, nodeId: string, toProfile: string, reason: string) {
  return api<ProfileSwitchResult>(`/v1/tasks/${encodeURIComponent(id)}/profile`, { method: "POST", body: JSON.stringify({ node_id: nodeId, to_profile: toProfile, reason }) });
}

/** 删除任务。后端是软删除：进行中的任务会先收到取消，列表立即不再显示。 */
export function deleteTask(id: string): Promise<void> {
  return api<void>(`/v1/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * `always`: with approve, also allow what the approval offered for the rest of the task.
 * `comment`: why it was refused or how to adjust; control keeps it on the decision (approval.decided) but the runtime does not hand it to the agent, so the page also sends it as a message.
 */
export function decideTaskApproval(id: string, approvalId: string, decision: "approve" | "reject", always = false, comment = "") {
  return api<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/approvals/${encodeURIComponent(approvalId)}`, { method: "POST", body: JSON.stringify({ decision, always, ...(comment ? { comment } : {}) }) });
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
