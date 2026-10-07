import { arrange, buildTimeline, type Segment, type Step, type StepState } from "./conversation";
import { eventPosition, type AttemptStatus, type TaskLiveState } from "./taskEvents";
import type { Task, TaskEvent } from "./tasks";
import type { NodeRole } from "./display";
import type { ArtifactFile } from "./artifacts";

/**
 * The group chat of a task with a team: every utterance in order, one bubble each, the work behind a member's bubble
 * (its tool calls, reasoning and streamed text) kept with that member. Pure functions over the event log; the page only
 * draws what they return.
 */

export type ChatMember = { readonly role: string; readonly label?: string; readonly expert: string; readonly name?: string };
export type ChatTeam = { readonly leader: string; readonly members: readonly ChatMember[] };

export interface ChatSpeaker {
  readonly role: string;
  /** What a person called the role; empty when there is none. */
  readonly label: string;
  /** The member's expert, by name. */
  readonly name: string;
  readonly leader: boolean;
}

/** What a member did on the way to a bubble. */
export interface ChatWork {
  readonly steps: readonly Step[];
  /** The steps and the words between them, in the order they happened (`steps` is its subset): what the bubble draws as its activity. */
  readonly segments: readonly Segment[];
  readonly thinking: string;
  /** The words after the last step (a bubble still in progress); empty once the bubble has its own text. */
  readonly text: string;
}

export type ChatItem =
  | { readonly type: "user"; readonly id: string; readonly pos: number; readonly text: string; readonly mentions: readonly string[]; readonly interrupt: boolean }
  | { readonly type: "system"; readonly id: string; readonly pos: number; readonly text: string }
  | { readonly type: "approval"; readonly id: string; readonly pos: number; readonly approvalId: string }
  | {
      readonly type: "bubble";
      readonly id: string;
      readonly pos: number;
      readonly speaker: ChatSpeaker;
      readonly to: readonly string[];
      readonly text: string;
      /** assign | reply | note | review | user | system, or `turn` for a node's own turn that has no message of its own. */
      readonly kind: string;
      readonly round: number;
      readonly hop: number;
      readonly artifacts: readonly string[];
      readonly nodeId: string;
      readonly attemptId: string;
      /** Set on the leader's review of a round. */
      readonly reviewRound?: number;
      readonly work?: ChatWork;
      /** Still being written: nothing has been said yet, only worked on. */
      readonly live: boolean;
      readonly status?: AttemptStatus;
      readonly failure?: string;
      /** When it was said (the message event's time); empty for a turn that has no message of its own. */
      readonly at?: string;
    }
  | { readonly type: "roster"; readonly id: string; readonly pos: number; readonly members: readonly RosterMember[] };

export type MemberStatus = "waiting" | "running" | "done" | "failed";

/** One member under the leader's turn: who, and how its work stands. */
export interface RosterMember {
  readonly role: string;
  readonly label: string;
  readonly name: string;
  readonly status: MemberStatus;
}

type BubbleItem = Extract<ChatItem, { type: "bubble" }>;

export type ChatGroup =
  | { readonly type: "bubbles"; readonly key: string; readonly speaker: ChatSpeaker; readonly items: readonly Extract<ChatItem, { type: "bubble" }>[] }
  | { readonly type: "user"; readonly key: string; readonly items: readonly Extract<ChatItem, { type: "user" }>[] }
  | { readonly type: "system"; readonly key: string; readonly items: readonly Extract<ChatItem, { type: "system" }>[] }
  | { readonly type: "approval"; readonly key: string; readonly items: readonly Extract<ChatItem, { type: "approval" }>[] }
  | { readonly type: "roster"; readonly key: string; readonly items: readonly Extract<ChatItem, { type: "roster" }>[] };

interface BuildInput {
  readonly task: Task;
  readonly events: readonly TaskEvent[];
  readonly live: TaskLiveState;
  readonly team: ChatTeam;
  readonly nameOf: (ref: string) => string;
  /** The plan's nodes: not needed for the chat itself, kept so callers can pass what they have. */
  readonly nodes?: readonly unknown[];
  /** Who each plan node belongs to (display.nodeRoles). */
  readonly roles: Readonly<Record<string, NodeRole>>;
  /** Nodes that are team stages: their attempts are told by team messages, not as a bubble of their own. */
  readonly stageNodeIds?: ReadonlySet<string>;
}

const str = (payload: Record<string, unknown>, key: string): string => (typeof payload[key] === "string" ? (payload[key] as string) : "");
const num = (payload: Record<string, unknown>, key: string): number => (typeof payload[key] === "number" ? (payload[key] as number) : 0);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function speakerOf(team: ChatTeam, role: string, label: string, nameOf: (ref: string) => string): ChatSpeaker {
  const member = team.members.find((item) => item.role === role);
  return { role, label: label || member?.label || "", name: member?.name || (member ? nameOf(member.expert) : ""), leader: role === team.leader };
}

// ---- mentions ---------------------------------------------------------------------------------------------------------

const ASCII_WORD = /[A-Za-z0-9_-]/;

/** The names a member can be @-ed by: its label and its role id, longest first so 「研究员」 wins over 「研究」. */
function namesOf(members: readonly ChatMember[]): Array<{ name: string; role: string }> {
  const names = members.flatMap((member) => [{ name: member.role, role: member.role }, ...(member.label ? [{ name: member.label, role: member.role }] : [])]);
  return names.sort((a, b) => b.name.length - a.name.length);
}

export interface MentionPart {
  readonly text: string;
  /** Set when the part is an @mention of this role. */
  readonly role?: string;
}

/** `text` cut into plain parts and @mentions of members; the parts put back together are exactly `text`. */
export function splitMentions(text: string, members: readonly ChatMember[]): MentionPart[] {
  const names = namesOf(members);
  const parts: MentionPart[] = [];
  let plain = "";
  for (let i = 0; i < text.length; ) {
    // An @ glued to a word before it (an e-mail address) is not a mention.
    const mention = text[i] === "@" && !(i > 0 && ASCII_WORD.test(text[i - 1])) ? names.find((item) => text.startsWith(item.name, i + 1) && !(ASCII_WORD.test(item.name.at(-1)!) && ASCII_WORD.test(text[i + 1 + item.name.length] ?? ""))) : undefined;
    if (!mention) {
      plain += text[i];
      i += 1;
      continue;
    }
    if (plain) parts.push({ text: plain });
    plain = "";
    parts.push({ text: `@${mention.name}`, role: mention.role });
    i += 1 + mention.name.length;
  }
  if (plain) parts.push({ text: plain });
  return parts;
}

/** The roles @-mentioned in `text`, each once, in the order of the team. */
export function parseMentions(text: string, members: readonly ChatMember[]): string[] {
  const found = new Set(splitMentions(text, members).flatMap((part) => (part.role ? [part.role] : [])));
  return members.map((member) => member.role).filter((role) => found.has(role));
}

/** The palette slot of a member: its place in the team, so it is the same on every screen and in every run. */
export function mentionColor(role: string, team: ChatTeam): number {
  const index = team.members.findIndex((member) => member.role === role);
  return index >= 0 ? index : [...role].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

// ---- building the chat --------------------------------------------------------------------------------------------------

/** What one agent session has done since its last bubble. */
interface Work {
  steps: Step[];
  /** `t:<block id>` / `s:<step id>` in the order the events came, as `Turn.order`. */
  order: string[];
  blocks: Map<string, string>;
  thinking: Map<string, string>;
  role: string;
  label: string;
  attemptId: string;
}

const emptyWork = (role: string, label: string, attemptId: string): Work => ({ steps: [], order: [], blocks: new Map(), thinking: new Map(), role, label, attemptId });

const workOf = (work: Work): ChatWork => {
  const { segments, answer } = arrange(work, [...work.blocks].map(([id, text]) => ({ id, text })), false);
  return { steps: work.steps, segments, thinking: [...work.thinking.values()].filter(Boolean).join("\n\n"), text: answer };
};

const noted = (order: string[], key: string) => (order.includes(key) ? order : [...order, key]);

const hasWork = (work: Work): boolean => work.steps.length > 0 || [...work.blocks.values()].some((text) => text !== "") || [...work.thinking.values()].some((text) => text !== "");

const STEP_STATES: readonly string[] = ["success", "error", "denied", "interrupted"];

/** Kinds of message that end a turn of the member: the work done before it belongs under it (a note leaves the turn open). */
const ENDS_TURN = ["assign", "reply", "review"];

export function buildChat(input: BuildInput): ChatItem[] {
  const { task, events, live, team, nameOf, roles, stageNodeIds = new Set<string>() } = input;
  const items: ChatItem[] = [];
  const work = new Map<string, Work>();
  const attributed = (event: TaskEvent) => typeof event.payload.team_role === "string" && event.payload.team_role !== "";
  const keyOf = (payload: Record<string, unknown>) => `${str(payload, "team_session") || str(payload, "team_role")}`;
  const workFor = (payload: Record<string, unknown>): Work => {
    const key = keyOf(payload);
    let found = work.get(key);
    if (!found) {
      found = emptyWork(str(payload, "team_role"), str(payload, "team_label"), str(payload, "attempt_id"));
      work.set(key, found);
    }
    return found;
  };
  const startPos = new Map<string, number>();
  let userSeen = false;
  let last = 0;

  for (const event of events) {
    const payload = event.payload;
    const pos = eventPosition(event);
    last = Math.max(last, pos);
    switch (event.type) {
      case "task.created":
        userSeen = true;
        items.push({ type: "user", id: event.event_id, pos, text: str(payload, "goal"), mentions: [], interrupt: false });
        break;
      case "message.user":
        items.push({ type: "user", id: event.event_id, pos, text: str(payload, "text"), mentions: strings(payload.mentions), interrupt: payload.delivery === "interrupt" });
        break;
      case "attempt.started":
        startPos.set(str(payload, "attempt_id"), pos);
        break;
      case "approval.requested":
        items.push({ type: "approval", id: event.event_id, pos, approvalId: str(payload, "approval_id") });
        break;
      case "tool.call_started":
      case "tool.call_finished": {
        if (!attributed(event)) break;
        const w = workFor(payload);
        const id = str(payload, "tool_call_id") || event.event_id;
        const finished = event.type === "tool.call_finished";
        const state = str(payload, "state");
        const step: Step = {
          id,
          tool: str(payload, "tool_name"),
          args: str(payload, "args_preview"),
          result: str(payload, "result_preview"),
          state: finished ? ((STEP_STATES.includes(state) ? state : "success") as StepState) : "running",
        };
        const at = w.steps.findIndex((item) => item.id === id);
        if (at >= 0) w.steps[at] = { ...w.steps[at], ...step, args: step.args || w.steps[at].args };
        else w.steps.push(step);
        w.order = noted(w.order, `s:${id}`);
        break;
      }
      case "agent.token_delta":
      case "agent.thinking_delta": {
        if (!attributed(event)) break;
        const w = workFor(payload);
        const blocks = event.type === "agent.token_delta" ? w.blocks : w.thinking;
        const id = str(payload, "block_id");
        blocks.set(id, (blocks.get(id) ?? "") + str(payload, "text"));
        if (event.type === "agent.token_delta") w.order = noted(w.order, `t:${id}`);
        break;
      }
      case "team.message": {
        const kind = str(payload, "kind") || "note";
        const text = str(payload, "text");
        if (kind === "user") break; // the user's own message.user is the bubble
        if (kind === "system") {
          items.push({ type: "system", id: event.event_id, pos, text });
          break;
        }
        const role = str(payload, "from_role") || str(payload, "role");
        const speaker = speakerOf(team, role, str(payload, "from_label") || str(payload, "label"), nameOf);
        const nodeId = str(payload, "node_id");
        // The work a member did before it spoke goes under what it said; a note leaves its turn open.
        let attached: ChatWork | undefined;
        if (ENDS_TURN.includes(kind)) {
          for (const [key, w] of work) {
            if (w.role === role && hasWork(w)) {
              // What the member said last is the message itself: the work keeps the words before it.
              attached = { ...workOf(w), text: "" };
              work.delete(key);
              break;
            }
          }
        }
        const reviewRound = kind === "review" && roles[nodeId]?.kind === "review" ? roles[nodeId].round : undefined;
        items.push({
          type: "bubble",
          id: event.event_id,
          pos,
          speaker,
          to: strings(payload.to_roles),
          text,
          kind,
          round: num(payload, "round"),
          hop: num(payload, "hop"),
          artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.flatMap((item) => (typeof (item as { name?: unknown })?.name === "string" ? [(item as { name: string }).name] : [])) : [],
          nodeId,
          attemptId: str(payload, "attempt_id"),
          ...(reviewRound ? { reviewRound } : {}),
          ...(attached ? { work: attached } : {}),
          live: false,
          at: event.occurred_at,
        });
        break;
      }
      default:
        break;
    }
  }

  // Plan-level attempts: the leader's exploration, a member's node, a review. The stage's attempt is told by its messages.
  const plain = events.filter((event) => !attributed(event));
  const stageAttempts = new Set(Object.keys(live.teams));
  const taken = new Set<string>();
  let before: ReturnType<typeof buildTimeline>[number] | undefined;
  for (const turn of buildTimeline(task, plain, live)) {
    const previous = before;
    before = turn;
    if (turn.kind !== "agent" || stageAttempts.has(turn.attemptId) || stageNodeIds.has(turn.nodeId)) continue;
    const role = roles[turn.nodeId];
    const speaker = role ? speakerOf(team, role.role, role.label, nameOf) : speakerOf(team, team.leader, "", nameOf);
    // A later generation is what the attempt did after the answer that split it (conversation.ts puts that message.user
    // right before it): it sits under that answer, not at the attempt's start.
    const split = turn.generation > 0 && previous?.kind === "user" ? items.find((item) => item.type === "user" && item.id === previous.id) : undefined;
    const base = split ? split.pos + 0.001 : (startPos.get(turn.attemptId) ?? last) + turn.generation * 0.01;
    const done = turn.status === "completed" || turn.status === "failed" || turn.status === "cancelled";
    const forTurn: ChatWork = { steps: turn.steps, segments: turn.segments, thinking: turn.thinking, text: "" };
    // The message the workflow wrote for this node already says what the attempt said: the attempt only adds its steps.
    const message = items.find((item): item is Extract<ChatItem, { type: "bubble" }> => item.type === "bubble" && item.nodeId === turn.nodeId && (item.kind === "reply" || item.kind === "review") && !taken.has(item.id));
    if (message && done) {
      taken.add(message.id);
      const at = items.indexOf(message);
      items[at] = { ...message, work: forTurn.segments.length > 0 || forTurn.thinking ? forTurn : message.work, attemptId: message.attemptId || turn.attemptId };
      continue;
    }
    items.push({
      type: "bubble",
      id: turn.id,
      pos: base,
      speaker,
      to: [],
      // The words between the steps stay in the work, in place; what the turn says last is its text.
      text: turn.answer,
      // A node's own turn, with no message of the workflow's for it (the leader's planning, a member still at work).
      kind: role?.kind === "review" ? "review" : "turn",
      round: 0,
      hop: 0,
      artifacts: [],
      nodeId: turn.nodeId,
      attemptId: turn.attemptId,
      ...(role?.kind === "review" && role.round ? { reviewRound: role.round } : {}),
      ...(forTurn.segments.length > 0 || forTurn.thinking ? { work: forTurn } : {}),
      live: !done,
      status: turn.status,
      ...(turn.failure ? { failure: turn.failure.message } : {}),
    });
  }
  void userSeen;

  // Members still working: a bubble each, with what they have streamed so far.
  let offset = 0;
  for (const [key, w] of work) {
    if (!hasWork(w) || !w.role) continue;
    offset += 1;
    items.push({
      type: "bubble",
      id: `live:${key}`,
      pos: last + offset,
      speaker: speakerOf(team, w.role, w.label, nameOf),
      to: [],
      text: "",
      kind: "turn",
      round: 0,
      hop: 0,
      artifacts: [],
      nodeId: "",
      attemptId: w.attemptId,
      work: workOf(w),
      live: true,
      status: "running",
    });
  }
  return items.sort((a, b) => a.pos - b.pos);
}

/** The chat in groups: consecutive bubbles of one speaker share a header; a user line, a notice or a card is a group of its own kind. */
export function groupChat(items: readonly ChatItem[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const item of items) {
    const tail = groups.at(-1);
    if (item.type === "bubble") {
      if (tail?.type === "bubbles" && tail.speaker.role === item.speaker.role) groups[groups.length - 1] = { ...tail, items: [...tail.items, item] };
      else groups.push({ type: "bubbles", key: item.id, speaker: item.speaker, items: [item] });
    } else if (tail?.type === item.type) {
      groups[groups.length - 1] = { ...tail, items: [...tail.items, item] } as ChatGroup;
    } else {
      groups.push({ type: item.type, key: item.id, items: [item] } as ChatGroup);
    }
  }
  return groups;
}

// ---- the main chat: the leader and summaries --------------------------------------------------------------------------------

const toUser = (bubble: BubbleItem) => bubble.to.length === 0 || bubble.to.includes("user");

/** What stays out of the main chat: the members' own bubbles and the leader's assignments (they live in the member's thread). */
function isMemberTalk(bubble: BubbleItem): boolean {
  if (!bubble.speaker.leader) return bubble.speaker.role !== "";
  return bubble.kind === "assign" || (bubble.kind === "note" && !toUser(bubble));
}

/**
 * The chat as the user reads it: their own messages, the leader's words to them, approvals and notices. A member's
 * bubbles and the leader's assignments are replaced by one roster row at the first of them after each user message,
 * saying who is on it and how each stands. The full items still feed the member's thread (`memberThread`). A member's reply is
 * never a bubble here: to the leader it is folded into the leader's review, to the user it leaves one quiet line.
 */
export function mainChat(items: readonly ChatItem[], team: ChatTeam): ChatItem[] {
  const out: ChatItem[] = [];
  type Segment = { at: number; status: Map<string, MemberStatus> };
  let segment: Segment | null = null;
  const segments: Segment[] = [];
  const set = (status: Map<string, MemberStatus>, role: string, value: MemberStatus) => {
    if (role && role !== team.leader) status.set(role, value);
  };
  for (const item of items) {
    if (item.type === "user") segment = null;
    if (item.type !== "bubble" || !isMemberTalk(item)) {
      out.push(item);
      continue;
    }
    if (!segment) {
      segment = { at: out.length, status: new Map() };
      segments.push(segment);
      out.push({ type: "roster", id: `roster:${item.id}`, pos: item.pos, members: [] });
    }
    const { status } = segment;
    if (item.kind === "assign") {
      for (const role of item.to) set(status, role, "waiting");
    } else if (item.live) {
      set(status, item.speaker.role, "running");
    } else if (item.status === "failed") {
      set(status, item.speaker.role, "failed");
    } else if (item.kind === "reply" || item.status === "completed") {
      set(status, item.speaker.role, "done");
    } else if (!status.has(item.speaker.role) || status.get(item.speaker.role) === "waiting") {
      set(status, item.speaker.role, "running");
    }
    // A member answering the user directly (the user @-ed it) has no leader review to carry its words: the answer stays in the
    // member's thread and the main chat says where it is, in one quiet line, instead of repeating it.
    if (item.kind === "reply" && !item.live && item.text !== "" && item.to.includes("user")) {
      out.push({ type: "system", id: `answered:${item.id}`, pos: item.pos, text: `${item.speaker.label || item.speaker.name || item.speaker.role} 已回复你，点上面的成员查看` });
    }
  }
  for (const { at, status } of segments) {
    const roster = out[at] as Extract<ChatItem, { type: "roster" }>;
    const members = team.members.filter((member) => status.has(member.role)).map((member): RosterMember => ({ role: member.role, label: member.label ?? "", name: member.name ?? "", status: status.get(member.role)! }));
    out[at] = { ...roster, members };
  }
  // A roster nobody is on (an assignment the leader gave itself) is not drawn: the leader's own work is its turns in the chat.
  return out.filter((item) => item.type !== "roster" || item.members.length > 0);
}

/** The leader's last word: it stays expanded, earlier reviews fold to a line. */
export function finalAnswerId(items: readonly ChatItem[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === "bubble" && item.speaker.leader && (item.text !== "" || item.live)) return item.id;
  }
  return "";
}

/** The first sentence of a text, for the one line a folded review leaves. */
export function firstSentence(text: string): string {
  const flat = text.replace(/[#>*`]+/g, " ").replace(/\s+/g, " ").trim();
  const end = flat.search(/[。！？!?]|\.(\s|$)/);
  const sentence = end >= 0 ? flat.slice(0, end + 1) : flat;
  return sentence.length > 80 ? `${sentence.slice(0, 80)}…` : sentence;
}

// ---- a member's thread ------------------------------------------------------------------------------------------------------

/** One assignment of the leader to a member, and what the member did and said until the next one. */
export interface ThreadSection {
  readonly assign?: BubbleItem;
  readonly bubbles: readonly BubbleItem[];
  /** Seconds from the assignment to the member's last bubble; null while it is working or when times are missing. */
  readonly seconds: number | null;
}

export function memberThread(items: readonly ChatItem[], role: string): ThreadSection[] {
  const sections: Array<{ assign?: BubbleItem; bubbles: BubbleItem[] }> = [];
  for (const item of items) {
    if (item.type !== "bubble") continue;
    if (item.kind === "assign" && item.to.includes(role)) sections.push({ assign: item, bubbles: [] });
    else if (item.speaker.role === role && !item.speaker.leader) {
      if (sections.length === 0) sections.push({ bubbles: [] });
      sections[sections.length - 1].bubbles.push(item);
    }
  }
  return sections.map((section) => {
    const last = section.bubbles.at(-1);
    const from = Date.parse(section.assign?.at ?? "");
    const to = Date.parse(last?.at ?? "");
    const done = last !== undefined && !last.live && last.kind !== "turn";
    return { ...section, seconds: done && Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.round((to - from) / 1000) : null };
  });
}

const leavesFiles = (bubble: BubbleItem) => (bubble.kind === "reply" || bubble.kind === "review" || bubble.kind === "turn") && bubble.attemptId !== "";

/**
 * The bubbles that show what their attempt left: the last one of each attempt. An artifact manifest belongs to an attempt, not to a
 * turn of it (a question you answered splits an attempt into several turns), and the files were written by the work that ended it.
 */
export function fileOwners(items: readonly ChatItem[]): ReadonlySet<string> {
  const last = new Map<string, string>();
  for (const item of items) if (item.type === "bubble" && leavesFiles(item)) last.set(item.attemptId, item.id);
  return new Set(last.values());
}

/** The files a bubble owns: the ones its message names, and (when it is the last bubble of its attempt: see `fileOwners`) what the attempt left. Without `owners`, every bubble of the attempt shows them. */
export function bubbleFiles(bubble: BubbleItem, files: readonly ArtifactFile[], owners?: ReadonlySet<string>): readonly ArtifactFile[] {
  const named = bubble.artifacts.flatMap((name) => files.filter((file) => file.name === name).slice(-1));
  const ofAttempt = leavesFiles(bubble) && (!owners || owners.has(bubble.id)) ? files.filter((file) => file.attemptId === bubble.attemptId) : [];
  const seen = new Set<string>();
  return [...named, ...ofAttempt].filter((file) => (seen.has(`${file.manifestId}/${file.name}`) ? false : (seen.add(`${file.manifestId}/${file.name}`), true)));
}

/** How each member of the latest roster stands: what the checklist reads, so it and the roster never disagree. */
export function latestRosterStatus(main: readonly ChatItem[]): ReadonlyMap<string, MemberStatus> {
  const last = [...main].reverse().find((item): item is Extract<ChatItem, { type: "roster" }> => item.type === "roster");
  return new Map((last?.members ?? []).map((member) => [member.role, member.status]));
}
