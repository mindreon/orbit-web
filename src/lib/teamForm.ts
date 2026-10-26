/**
 * 专家团创建表单，字段和 main 的创建页一致：名称、成员（显示名、担任的专家、一句话职责），
 * 领队是其中一行的单选；角色 ID 放在「高级」里，自动生成。
 *
 * v2 的 team.json 只能记名册名字、角色（领队/成员）和专家引用。名册名字必须是 ASCII，
 * 所以角色 ID 写入 roles[].name。中文显示名和职责另记在 members.json，详情页用它来显示。
 * 运行时派活读的是专家自己的职能；职责留空，就是用那一句。
 */

export const TEAM_MIN_MEMBERS = 1;
export const TEAM_MAX_MEMBERS = 8;
export const TEAM_DESCRIPTION_MAX = 300;
export const TEAM_NAME_MAX = 100;
export const TEAM_LABEL_MAX = 40;

const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const RESERVED_ROLES = new Set(["main", "team"]);

export const refusalText = {
  NAME_INVALID: "名称要 1 到 100 个字。",
  TEAM_NO_MEMBERS: "专家团至少要有一名成员。",
  TEAM_TOO_MANY_MEMBERS: "专家团最多 8 名成员。",
  TEAM_DUPLICATE_ROLE: "角色 ID 不能重复。",
  TEAM_LEADER_NOT_MEMBER: "领队必须是其中一名成员。",
  ROLE_INVALID: "角色 ID 要小写字母开头，只含小写字母、数字、- 和 _，最长 32 个字符。",
  ROLE_RESERVED: "main 和 team 是保留的角色 ID，请换一个。",
  TEAM_MEMBER_NOT_FOUND: "这位成员的专家不存在，或不在你的空间里。",
  DESCRIPTION_TOO_LONG: "职责最多 300 个字。",
  LABEL_TOO_LONG: "显示名最多 40 个字。",
} as const;

/** 能被选进专家团的单人专家。只取表单用得到的字段，测试不必凑齐整份资产。 */
export type TeamExpert = {
  id: string;
  publisher: string;
  name: string;
  display_name: string | null;
  description: string | null;
};

/** 一行成员。label 给人看；role 是程序用的角色 ID；expert 是选中的专家 id，还没选是 ""。 */
export type MemberDraft = {
  readonly key: string;
  readonly label: string;
  readonly role: string;
  readonly expert: string;
  readonly description: string;
};

/** leader 记的是那一行的 key。改角色 ID 不会把领队弄丢。 */
export type TeamForm = {
  readonly name: string;
  readonly leader: string;
  readonly members: readonly MemberDraft[];
};

export type RowProblems = { label?: string; role?: string; expert?: string; description?: string };

export type TeamProblems = {
  readonly name?: string;
  readonly members?: string;
  readonly leader?: string;
  readonly rows: Readonly<Record<string, RowProblems>>;
};

export type RosterNote = { name: string; label: string; description: string };

const chars = (value: string) => [...value].length;

/** 中文名称不能当资产标识，所以另生成一个小写标识。目录导入的标识以 cat- 开头，这里避开它。 */
export function slugFor(display: string) {
  const ascii = display.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (/^[a-z0-9][a-z0-9-]{2,63}$/.test(ascii) && !ascii.startsWith("cat-")) return ascii.slice(0, 64);
  let hash = 0;
  for (const char of display) hash = (Math.imul(hash, 33) + char.codePointAt(0)!) >>> 0;
  return `ex-${hash.toString(16).padStart(8, "0")}`;
}

export function agentRef(expert: Pick<TeamExpert, "publisher" | "name">) {
  return `${expert.publisher}/${expert.name}@^1.0.0`;
}

export const hasProblems = (problems: TeamProblems): boolean =>
  Boolean(problems.name || problems.members || problems.leader) || Object.keys(problems.rows).length > 0;

/**
 * 提交前先按 main 同一套规则检查，让人立刻看到哪一格不对。
 * known 是当前能选的单人专家；选中的专家不在里面就拒绝。
 */
export function validateTeam(form: TeamForm, known: readonly Pick<TeamExpert, "id">[]): TeamProblems {
  const rows: Record<string, RowProblems> = {};
  const mark = (key: string, field: keyof RowProblems, text: string) => {
    rows[key] = { ...rows[key], [field]: text };
  };
  const name = form.name.trim();
  const problems: { name?: string; members?: string; leader?: string } = {};
  if (name === "") problems.name = "请填写专家团的名称。";
  else if (chars(name) > TEAM_NAME_MAX) problems.name = refusalText.NAME_INVALID;
  if (form.members.length < TEAM_MIN_MEMBERS) problems.members = refusalText.TEAM_NO_MEMBERS;
  if (form.members.length > TEAM_MAX_MEMBERS) problems.members = refusalText.TEAM_TOO_MANY_MEMBERS;
  const earlier = new Set<string>();
  for (const member of form.members) {
    const role = member.role.trim();
    const label = member.label.trim();
    if (label === "") mark(member.key, "label", "请填写这位成员的显示名。");
    else if (chars(label) > TEAM_LABEL_MAX) mark(member.key, "label", refusalText.LABEL_TOO_LONG);
    if (!ROLE_PATTERN.test(role)) mark(member.key, "role", refusalText.ROLE_INVALID);
    else if (RESERVED_ROLES.has(role)) mark(member.key, "role", refusalText.ROLE_RESERVED);
    else if (earlier.has(role)) mark(member.key, "role", refusalText.TEAM_DUPLICATE_ROLE);
    if (ROLE_PATTERN.test(role) && !RESERVED_ROLES.has(role)) earlier.add(role);
    if (member.expert === "") mark(member.key, "expert", "请选择这位成员由哪位专家担任。");
    else if (!known.some((expert) => expert.id === member.expert)) mark(member.key, "expert", refusalText.TEAM_MEMBER_NOT_FOUND);
    if (chars(member.description.trim()) > TEAM_DESCRIPTION_MAX) mark(member.key, "description", refusalText.DESCRIPTION_TOO_LONG);
  }
  if (!form.members.some((member) => member.key === form.leader)) problems.leader = refusalText.TEAM_LEADER_NOT_MEMBER;
  return { ...problems, rows };
}

/** 还没有人占用的第一个 member-N。 */
export function freeRole(members: readonly Pick<MemberDraft, "role">[]): string {
  const taken = new Set(members.map((member) => member.role.trim()));
  let n = 1;
  while (taken.has(`member-${n}`)) n += 1;
  return `member-${n}`;
}

let rowCounter = 0;
export const newRow = (role: string, label = "", expert = "", description = ""): MemberDraft => ({
  key: `row-${(rowCounter += 1)}`,
  label,
  role,
  expert,
  description,
});

/** 新建的专家团先有领队那一行：专家团至少要有一位成员。 */
export const blankTeamForm = (): TeamForm => {
  const lead = newRow("member-1", "领队");
  return { name: "", leader: lead.key, members: [lead] };
};

/** 下一位成员，角色 ID 不和已有的撞车。 */
export const addedRow = (form: TeamForm): MemberDraft => newRow(freeRole(form.members));

/** 详情页读 members.json，把显示名和职责对上名册名字。文件缺失或损坏就当没有。 */
export function parseRosterNotes(text: string): RosterNote[] {
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text) as { members?: unknown };
    if (!parsed || !Array.isArray(parsed.members)) return [];
    return parsed.members.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { name?: unknown; label?: unknown; description?: unknown };
      if (typeof row.name !== "string" || typeof row.label !== "string") return [];
      return [{ name: row.name, label: row.label, description: typeof row.description === "string" ? row.description : "" }];
    });
  } catch {
    return [];
  }
}

/** 通过检查之后，打成 v2 专家团包：team.json 给运行时，members.json 和 AGENTS.md 给人看。 */
export function teamFiles(form: TeamForm, choices: readonly TeamExpert[]): Record<string, string> {
  const display = form.name.trim();
  const byId = new Map(choices.map((expert) => [expert.id, expert]));
  const roles = form.members.flatMap((member) => {
    const expert = byId.get(member.expert);
    if (!expert) return [];
    return [{ name: member.role.trim(), role: member.key === form.leader ? "leader" : "teammate", agent: agentRef(expert) }];
  });
  const notes: RosterNote[] = form.members.map((member) => ({
    name: member.role.trim(),
    label: member.label.trim(),
    description: member.description.trim(),
  }));
  const lines = form.members.map((member) => {
    const expert = byId.get(member.expert);
    const duty = member.description.trim() || expert?.description?.trim() || "";
    const who = `${member.role.trim()}（${member.label.trim()}${member.key === form.leader ? "，领队" : ""}）`;
    return duty ? `- ${who}：${duty}` : `- ${who}`;
  });
  const manifest = {
    schema: "orbit.team/v1",
    name: slugFor(display),
    description: display,
    roles,
    dispatch: "scheduled",
  };
  return {
    "team.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "members.json": `${JSON.stringify({ members: notes }, null, 2)}\n`,
    "AGENTS.md": `${display}\n\n${lines.join("\n")}\n`,
  };
}
