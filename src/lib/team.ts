import { refusalText, ApiError } from "./api";
import type { Expert, TeamMemberInput } from "./experts";
import { teamMessageCount, type TeamStageView } from "./taskEvents";

/** The limits control and the workflow enforce on a team (control `experts.go`; contract `TeamMember`). */
export const TEAM_MIN_MEMBERS = 1;
export const TEAM_MAX_MEMBERS = 8;
export const TEAM_DESCRIPTION_MAX = 300;
export const TEAM_NAME_MAX = 100;
export const TEAM_LABEL_MAX = 40;
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** `writer@2` -> `writer`. */
export const refId = (ref: string): string => ref.replace(/@\d+$/, "");

/**
 * One row of the team form. `label` is what a person sees (the primary field); `role` is the ASCII id the workflow uses,
 * made for the row (`member-1`) and editable under 「高级」. `expert` is a single expert's version ref (`id@3`), or "".
 */
export type MemberDraft = { readonly key: string; readonly label: string; readonly role: string; readonly expert: string; readonly description: string };

/** `leader` is the key of the member row that leads, so renaming the leader's role keeps it the leader. */
export type TeamForm = { readonly name: string; readonly leader: string; readonly members: readonly MemberDraft[] };

export type RowProblems = { label?: string; role?: string; expert?: string; description?: string };

export type TeamProblems = {
  readonly name?: string;
  readonly members?: string;
  readonly leader?: string;
  /** Per row key. */
  readonly rows: Readonly<Record<string, RowProblems>>;
};

export const noProblems: TeamProblems = { rows: {} };

export const hasProblems = (problems: TeamProblems): boolean => Boolean(problems.name || problems.members || problems.leader) || Object.keys(problems.rows).length > 0;

/**
 * The rules control applies to a team, checked before the request is sent so a person is told at once. Control stays the
 * judge (`teamProblemsFromRefusal` shows what it says); these are the same rules, said in the same words.
 * `known` are the single experts a member may be; a member whose expert is not among them is refused (any version of it
 * counts, a team keeps the version it was built with).
 */
export function validateTeam(form: TeamForm, known: readonly Pick<Expert, "expert_id">[]): TeamProblems {
  const rows: Record<string, RowProblems> = {};
  const mark = (key: string, field: keyof RowProblems, text: string) => {
    rows[key] = { ...rows[key], [field]: text };
  };
  const name = form.name.trim();
  const problems: { name?: string; members?: string; leader?: string } = {};
  if (name === "") problems.name = "请填写专家团的名称。";
  else if ([...name].length > TEAM_NAME_MAX) problems.name = refusalText.NAME_INVALID;
  if (form.members.length < TEAM_MIN_MEMBERS) problems.members = refusalText.TEAM_NO_MEMBERS;
  if (form.members.length > TEAM_MAX_MEMBERS) problems.members = refusalText.TEAM_TOO_MANY_MEMBERS;
  // A role is a duplicate only of a role another row really has: each row is compared with the rows before it.
  const earlier = new Set<string>();
  for (const member of form.members) {
    const role = member.role.trim();
    const label = member.label.trim();
    if (label === "") mark(member.key, "label", "请填写这位成员的显示名。");
    else if ([...label].length > TEAM_LABEL_MAX) mark(member.key, "label", refusalText.LABEL_TOO_LONG);
    if (!ROLE_PATTERN.test(role)) mark(member.key, "role", refusalText.ROLE_INVALID);
    else if (earlier.has(role)) mark(member.key, "role", refusalText.TEAM_DUPLICATE_ROLE);
    if (ROLE_PATTERN.test(role)) earlier.add(role);
    if (member.expert === "") mark(member.key, "expert", "请选择这位成员由哪位专家担任。");
    else if (!known.some((expert) => expert.expert_id === refId(member.expert))) mark(member.key, "expert", refusalText.TEAM_MEMBER_NOT_FOUND);
    if ([...member.description.trim()].length > TEAM_DESCRIPTION_MAX) mark(member.key, "description", refusalText.DESCRIPTION_TOO_LONG);
  }
  if (!form.members.some((member) => member.key === form.leader)) problems.leader = refusalText.TEAM_LEADER_NOT_MEMBER;
  return { ...problems, rows };
}

/** The request body for a team that passed `validateTeam`. */
export function teamInput(form: TeamForm): { name: string; kind: "team"; leader: string; members: TeamMemberInput[] } {
  return {
    name: form.name.trim(),
    kind: "team",
    leader: form.members.find((member) => member.key === form.leader)?.role.trim() ?? "",
    members: form.members.map((member) => ({
      role: member.role.trim(),
      label: member.label.trim(),
      expert: member.expert,
      ...(member.description.trim() ? { description: member.description.trim() } : {}),
    })),
  };
}

/** The first `member-N` id no row of the form has. */
export function freeRole(members: readonly Pick<MemberDraft, "role">[]): string {
  const taken = new Set(members.map((member) => member.role.trim()));
  let n = 1;
  while (taken.has(`member-${n}`)) n += 1;
  return `member-${n}`;
}

let rowCounter = 0;
export const newRow = (role: string, label = "", expert = "", description = ""): MemberDraft => ({ key: `row-${(rowCounter += 1)}`, label, role, expert, description });

/** A new team starts with its leader's row: a team always has one. */
export const blankTeamForm = (): TeamForm => {
  const lead = newRow("member-1", "领队");
  return { name: "", leader: lead.key, members: [lead] };
};

/** The row for the next member, with an id of its own. */
export const addedRow = (form: TeamForm): MemberDraft => newRow(freeRole(form.members));

/**
 * A stored team as a form. A member from before labels existed has none: its form shows the role id, which is what it was
 * always shown as (and the leader's 「领队」).
 */
export function teamToForm(team: Pick<Expert, "name" | "leader" | "members">): TeamForm {
  const members = (team.members ?? []).map((member) => newRow(member.role, member.label || (member.role === team.leader ? "领队" : member.role), member.expert, member.description ?? ""));
  return { name: team.name, leader: members.find((member) => member.role === team.leader)?.key ?? "", members };
}

/**
 * A refusal from control on the form: its code in Chinese, attached to the part it is about. `field` is the request field
 * (`name`, `leader`, `members`, `members[2].expert`); a refusal with no field of its own (or one the form has no place
 * for) comes back as `general`, for the page to show above the form.
 */
export function teamProblemsFromRefusal(error: unknown, form: TeamForm): { problems: TeamProblems; general: string } | null {
  if (!(error instanceof ApiError) || error.kind !== "http" || error.status !== 400) return null;
  const text = refusalText[error.code] ?? error.serverMessage;
  if (!text) return null;
  const field = error.field;
  const row = /^members\[(\d+)\]\.(role|label|expert|description)$/.exec(field);
  if (row) {
    const member = form.members[Number(row[1])];
    if (member) return { problems: { rows: { [member.key]: { [row[2]]: text } } }, general: "" };
  }
  if (field === "name") return { problems: { name: text, rows: {} }, general: "" };
  if (field === "leader") return { problems: { leader: text, rows: {} }, general: "" };
  if (field === "members") return { problems: { members: text, rows: {} }, general: "" };
  return { problems: noProblems, general: text };
}

/** 「第 2/10 轮 · 消息 12/100 · 跳数上限 3」: where a team stage is against its limits. A limit the page was not told is left out, not guessed. */
export function teamProgressText(stage: TeamStageView): string {
  const rounds = stage.maxRounds > 0 ? `第 ${stage.round}/${stage.maxRounds} 轮` : `第 ${stage.round} 轮`;
  const used = stage.messages ?? teamMessageCount(stage);
  return `${rounds} · 消息 ${used}${stage.maxMessages ? `/${stage.maxMessages}` : ""}${stage.maxHops !== undefined ? ` · 跳数上限 ${stage.maxHops}` : ""}`;
}

/** The stage with the limits the plan node carries filled in where the events did not say. */
export function withLimits(stage: TeamStageView, limits: { max_rounds?: number; max_messages?: number; max_members?: number; max_hops?: number } | null | undefined): TeamStageView {
  if (!limits) return stage;
  return {
    ...stage,
    maxRounds: stage.maxRounds || limits.max_rounds || 0,
    ...(stage.maxMessages ?? limits.max_messages ? { maxMessages: stage.maxMessages ?? limits.max_messages } : {}),
    ...(stage.maxHops ?? limits.max_hops) !== undefined ? { maxHops: stage.maxHops ?? limits.max_hops } : {},
    ...(stage.maxMembers ?? limits.max_members ? { maxMembers: stage.maxMembers ?? limits.max_members } : {}),
  };
}

/** The turns of one round, in the order they started. */
export const turnsOfRound = (stage: TeamStageView, round: number) => stage.turns.filter((turn) => turn.round === round);

/** The first characters of names for a stack of avatars; at most `max` are shown and the rest are counted. */
export function avatarStack<T extends { readonly name: string }>(members: readonly T[], max = 4): { shown: T[]; more: number } {
  return { shown: members.slice(0, max), more: Math.max(0, members.length - max) };
}
