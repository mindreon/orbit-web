import { describe, expect, it } from "vitest";
import { ApiError, refusalText } from "./api";
import { isTeam, singleExperts } from "./experts";
import { applyEvent, emptyLiveState } from "./taskEvents";
import { addedRow, avatarStack, blankTeamForm, freeRole, hasProblems, newRow, refId, teamInput, teamProblemsFromRefusal, teamProgressText, teamToForm, validateTeam, withLimits, type TeamForm } from "./team";

/**
 * Ways the team form and its helpers can fail, each asserted below:
 *   F1 a team control would refuse is sent anyway (no member, nine members, a bad or repeated role id, no label, a leader
 *      nobody is, an unchosen expert, a duty over 300 characters), or one it accepts is held back
 *   F2 the leader is lost when its role id is renamed, or when the leader's row is removed
 *   F3 control's refusal reaches the person in English, or under the wrong field, or as nothing
 *   F4 a role id is flagged as a repeat of a row that does not have it (the false 「角色名不能重复」), or the flag stays after
 *      the field was fixed
 *   F5 a team can be picked as a member or as a node's expert
 *   F6 the progress line shows a limit the stage was not given, or hides one it was
 *   F7 a new member's role id repeats another's, or is not a valid id
 */
const known = [{ expert_id: "researcher_x" }, { expert_id: "writer_y" }];
const form = (members: Array<[role: string, expert: string, label?: string, description?: string]>, leaderIndex = 0, name = "内容小队"): TeamForm => {
  const rows = members.map(([role, expert, label, description]) => newRow(role, label ?? `成员${role}`, expert, description ?? ""));
  return { name, leader: rows[leaderIndex]?.key ?? "", members: rows };
};

describe("validateTeam", () => {
  it("accepts a team control would accept (F1)", () => {
    expect(hasProblems(validateTeam(form([["member-1", "writer_y@1"], ["member-2", "researcher_x@2", "研究员", "找资料"]]), known))).toBe(false);
  });

  it("accepts one member who leads, and eight members (F1)", () => {
    expect(hasProblems(validateTeam(form([["member-1", "writer_y@1"]]), known))).toBe(false);
    const eight = form(Array.from({ length: 8 }, (_, i) => [`r${i}`, "writer_y@1"] as [string, string]));
    expect(hasProblems(validateTeam(eight, known))).toBe(false);
  });

  it("refuses no members and nine members with control's words (F1)", () => {
    expect(validateTeam({ name: "x", leader: "", members: [] }, known).members).toBe(refusalText.TEAM_NO_MEMBERS);
    const nine = form(Array.from({ length: 9 }, (_, i) => [`r${i}`, "writer_y@1"] as [string, string]));
    expect(validateTeam(nine, known).members).toBe(refusalText.TEAM_TOO_MANY_MEMBERS);
  });

  it("refuses an empty or over-long name (F1)", () => {
    expect(validateTeam(form([["a", "writer_y@1"]], 0, "  "), known).name).toBe("请填写专家团的名称。");
    expect(validateTeam(form([["a", "writer_y@1"]], 0, "名".repeat(101)), known).name).toBe(refusalText.NAME_INVALID);
    expect(validateTeam(form([["a", "writer_y@1"]], 0, "名".repeat(100)), known).name).toBeUndefined();
  });

  it("wants a label, at most 40 characters (F1)", () => {
    const rows = form([["a", "writer_y@1", " "], ["b", "writer_y@1", "显".repeat(41)], ["c", "writer_y@1", "显".repeat(40)]]);
    const problems = validateTeam(rows, known);
    expect(rows.members.map((member) => problems.rows[member.key]?.label)).toEqual(["请填写这位成员的显示名。", refusalText.LABEL_TOO_LONG, undefined]);
  });

  it("refuses an empty, uppercase, too long or repeated role id, naming the row (F1)", () => {
    const rows = form([["", "writer_y@1"], ["Writer", "writer_y@1"], ["a".repeat(33), "writer_y@1"], ["ok", "writer_y@1"], ["ok", "writer_y@1"], ["9lives", "writer_y@1"]]);
    const problems = validateTeam(rows, known);
    const byRow = rows.members.map((member) => problems.rows[member.key]?.role);
    expect(byRow[0]).toBe(refusalText.ROLE_INVALID);
    expect(byRow[1]).toBe(refusalText.ROLE_INVALID);
    expect(byRow[2]).toBe(refusalText.ROLE_INVALID);
    expect(byRow[3]).toBeUndefined();
    expect(byRow[4]).toBe(refusalText.TEAM_DUPLICATE_ROLE);
    expect(byRow[5]).toBe(refusalText.ROLE_INVALID);
  });

  it("flags a repeat only on the row that repeats, and only of a role another row really has (F4)", () => {
    // The screenshot case: `lead` and `researcher` are two roles. Nothing repeats.
    const rows = form([["lead", "writer_y@1"], ["researcher", "researcher_x@2"]]);
    expect(validateTeam(rows, known).rows).toEqual({});
    // Two empty ids are two invalid ids, not a repeated one.
    const empty = form([["", "writer_y@1"], ["", "writer_y@1"]]);
    expect(Object.values(validateTeam(empty, known).rows).map((row) => row.role)).toEqual([refusalText.ROLE_INVALID, refusalText.ROLE_INVALID]);
    // A repeat the person then fixes is not flagged any more: the check is of the form as it is now.
    const repeated = form([["lead", "writer_y@1"], ["lead", "researcher_x@2"]]);
    expect(validateTeam(repeated, known).rows[repeated.members[1].key]?.role).toBe(refusalText.TEAM_DUPLICATE_ROLE);
    const fixed = { ...repeated, members: repeated.members.map((member, i) => (i === 1 ? { ...member, role: "researcher" } : member)) };
    expect(hasProblems(validateTeam(fixed, known))).toBe(false);
    // The first of two equal ids is the original, not the repeat.
    expect(validateTeam(repeated, known).rows[repeated.members[0].key]).toBeUndefined();
  });

  it("accepts the role ids control accepts: letters, digits, - and _ (F1)", () => {
    expect(hasProblems(validateTeam(form([["a", "writer_y@1"], ["r-2", "writer_y@1"], ["r_3", "writer_y@1"], ["a".repeat(32), "writer_y@1"]]), known))).toBe(false);
  });

  it("refuses a member with no expert, or one that is not the user's any more, but not an older version of one that is (F1)", () => {
    const rows = form([["lead", "writer_y@1"], ["a", ""], ["b", "gone_z@1"], ["c", "researcher_x@1"]]);
    const problems = validateTeam(rows, known);
    expect(problems.rows[rows.members[1].key]?.expert).toBe("请选择这位成员由哪位专家担任。");
    expect(problems.rows[rows.members[2].key]?.expert).toBe(refusalText.TEAM_MEMBER_NOT_FOUND);
    expect(problems.rows[rows.members[3].key]).toBeUndefined();
  });

  it("refuses a duty over 300 characters (F1)", () => {
    const rows = form([["lead", "writer_y@1", "领队", "责".repeat(301)]]);
    expect(validateTeam(rows, known).rows[rows.members[0].key]?.description).toBe(refusalText.DESCRIPTION_TOO_LONG);
    expect(hasProblems(validateTeam(form([["lead", "writer_y@1", "领队", "责".repeat(300)]]), known))).toBe(false);
  });

  it("wants a leader that is one of the members (F1)", () => {
    expect(validateTeam({ ...form([["lead", "writer_y@1"]]), leader: "" }, known).leader).toBe(refusalText.TEAM_LEADER_NOT_MEMBER);
    expect(validateTeam({ ...form([["lead", "writer_y@1"]]), leader: "row-gone" }, known).leader).toBe(refusalText.TEAM_LEADER_NOT_MEMBER);
  });
});

describe("teamInput and the form", () => {
  it("sends the leader's role id and every label, trims, and leaves out an empty duty (F2)", () => {
    const rows = form([[" lead ", "writer_y@1", " 主编 ", "  "], ["member-2", "researcher_x@2", "研究员", " 找资料 "]], 1, " 内容小队 ");
    expect(teamInput(rows)).toEqual({
      name: "内容小队",
      kind: "team",
      leader: "member-2",
      members: [{ role: "lead", label: "主编", expert: "writer_y@1" }, { role: "member-2", label: "研究员", expert: "researcher_x@2", description: "找资料" }],
    });
  });

  it("keeps the leader when its role id is renamed (F2)", () => {
    const rows = form([["lead", "writer_y@1"], ["researcher", "researcher_x@2"]]);
    const renamed = { ...rows, members: rows.members.map((member, i) => (i === 0 ? { ...member, role: "chief" } : member)) };
    expect(teamInput(renamed).leader).toBe("chief");
  });

  it("starts a new team with a leader row labelled 领队 and an id, and reads a stored team back with its leader marked (F2)", () => {
    const blank = blankTeamForm();
    expect(blank.members).toHaveLength(1);
    expect(blank.members[0]).toMatchObject({ role: "member-1", label: "领队" });
    expect(blank.leader).toBe(blank.members[0].key);
    const stored = teamToForm({ name: "内容小队", leader: "member-2", members: [{ role: "member-1", expert: "a@1", name: "A", label: "编辑" }, { role: "member-2", expert: "b@1", name: "B", label: "主编", description: "找资料" }] });
    expect(stored.members.find((member) => member.key === stored.leader)?.role).toBe("member-2");
    expect(stored.members.map((member) => member.label)).toEqual(["编辑", "主编"]);
    expect(stored.members[1].description).toBe("找资料");
  });

  it("shows a member from before labels by its role id, the leader as 领队 (F2)", () => {
    const stored = teamToForm({ name: "旧团", leader: "lead", members: [{ role: "lead", expert: "a@1", name: "A" }, { role: "researcher", expert: "b@1", name: "B" }] });
    expect(stored.members.map((member) => member.label)).toEqual(["领队", "researcher"]);
  });

  it("gives each new member an id no other has, and a valid one (F7)", () => {
    expect(freeRole([])).toBe("member-1");
    expect(freeRole([{ role: "member-1" }, { role: "member-2" }])).toBe("member-3");
    expect(freeRole([{ role: "member-2" }])).toBe("member-1");
    let rows = blankTeamForm();
    for (let i = 0; i < 7; i += 1) rows = { ...rows, members: [...rows.members, addedRow(rows)] };
    const roles = rows.members.map((member) => member.role);
    expect(new Set(roles).size).toBe(8);
    expect(roles.every((role) => /^[a-z][a-z0-9_-]{0,31}$/.test(role))).toBe(true);
  });

  it("reads the expert id out of a ref (F1)", () => {
    expect(refId("writer@12")).toBe("writer");
    expect(refId("writer")).toBe("writer");
  });
});

describe("teamProblemsFromRefusal", () => {
  const rows = form([["member-1", "writer_y@1"], ["member-2", "researcher_x@2"], ["member-3", "gone_z@1"]]);
  const refused = (code: string, field: string, message = "x") => new ApiError("http", 400, message, code, field);

  it("puts a member's refusal under that member's field, in Chinese (F3)", () => {
    const found = teamProblemsFromRefusal(refused("TEAM_MEMBER_NOT_FOUND", "members[2].expert", "unknown team member expert"), rows)!;
    expect(found.problems.rows).toEqual({ [rows.members[2].key]: { expert: refusalText.TEAM_MEMBER_NOT_FOUND } });
    expect(found.general).toBe("");
  });

  it("covers each member field the form has (F3)", () => {
    for (const [code, field] of [["ROLE_INVALID", "role"], ["LABEL_TOO_LONG", "label"], ["DESCRIPTION_TOO_LONG", "description"], ["TEAM_MEMBER_IS_TEAM", "expert"]] as const) {
      const found = teamProblemsFromRefusal(refused(code, `members[0].${field}`), rows)!;
      expect(found.problems.rows[rows.members[0].key]?.[field], code).toBe(refusalText[code]);
    }
  });

  it("puts a name, a leader and a members refusal where they belong (F3)", () => {
    expect(teamProblemsFromRefusal(refused("NAME_INVALID", "name"), rows)!.problems.name).toBe(refusalText.NAME_INVALID);
    expect(teamProblemsFromRefusal(refused("TEAM_LEADER_NOT_MEMBER", "leader"), rows)!.problems.leader).toBe(refusalText.TEAM_LEADER_NOT_MEMBER);
    expect(teamProblemsFromRefusal(refused("TEAM_TOO_MANY_MEMBERS", "members"), rows)!.problems.members).toBe(refusalText.TEAM_TOO_MANY_MEMBERS);
  });

  it("shows a refusal with no place on the form above it, and one about a row that is gone there too (F3)", () => {
    expect(teamProblemsFromRefusal(refused("KIND_IMMUTABLE", "kind"), rows)).toMatchObject({ general: refusalText.KIND_IMMUTABLE });
    expect(teamProblemsFromRefusal(refused("TEAM_SELF_REFERENCE", "members[9].expert"), rows)).toMatchObject({ general: refusalText.TEAM_SELF_REFERENCE });
  });

  it("keeps the server's own words for a code it does not know, and passes over what is not a refusal (F3)", () => {
    expect(teamProblemsFromRefusal(refused("SOMETHING_NEW", "", "brand new rule"), rows)).toMatchObject({ general: "brand new rule" });
    expect(teamProblemsFromRefusal(new ApiError("http", 500, "boom", "INTERNAL"), rows)).toBeNull();
    expect(teamProblemsFromRefusal(new ApiError("unreachable", null, ""), rows)).toBeNull();
    expect(teamProblemsFromRefusal(new Error("x"), rows)).toBeNull();
  });
});

describe("experts", () => {
  const list = [{ kind: "expert" as const }, { kind: undefined }, { kind: "team" as const }];
  it("lets a team be neither a member nor a node's expert (F5)", () => {
    expect(singleExperts(list)).toHaveLength(2);
    expect(isTeam({ kind: "team" })).toBe(true);
    expect(isTeam({})).toBe(false);
  });
});

describe("avatars and progress", () => {
  const at = (seq: number, type: string, payload: Record<string, unknown>) => ({ seq, type, payload: { node_id: "n", attempt_id: "a", ...payload }, event_id: `e${seq}`, task_id: "t", source: "workflow", occurred_at: "2026-10-05T00:00:00Z" });

  it("shows the first few members and counts the rest", () => {
    const members = Array.from({ length: 6 }, (_, i) => ({ name: `m${i}` }));
    expect(avatarStack(members, 4)).toMatchObject({ more: 2 });
    expect(avatarStack(members, 4).shown).toHaveLength(4);
    expect(avatarStack(members.slice(0, 2), 4)).toMatchObject({ more: 0 });
  });

  it("says where a stage is, with the limits the stage reported (F6)", () => {
    const state = [at(1, "team.round_started", { round: 2, max_rounds: 10, max_messages: 40, max_members: 4, messages: 7 }), at(2, "team.message", { seq: 1, round: 1, from_role: "lead", text: "hi" })].reduce(applyEvent, emptyLiveState);
    // The reported count (7) and the message that came after it.
    expect(teamProgressText(Object.values(state.teams)[0])).toBe("第 2/10 轮 · 消息 8/40 · 跳数上限 4".replace(" · 跳数上限 4", ""));
  });

  it("takes the count from team.round_finished, and counts the events itself when none says (F6)", () => {
    const told = [at(1, "team.round_started", { round: 1, max_rounds: 10, max_messages: 40 }), at(2, "team.round_finished", { round: 1, outcome: "assigned", messages: 9 })].reduce(applyEvent, emptyLiveState);
    expect(teamProgressText(Object.values(told.teams)[0])).toBe("第 1/10 轮 · 消息 9/40");
    const counted = [at(1, "team.round_started", { round: 1, max_rounds: 10 }), at(2, "team.message", { seq: 1, round: 1, from_role: "lead", text: "hi" })].reduce(applyEvent, emptyLiveState);
    // No limit was reported: none is shown, none is made up.
    expect(teamProgressText(Object.values(counted.teams)[0])).toBe("第 1/10 轮 · 消息 1");
  });

  it("fills in the limits of the plan node where the events did not say (F6)", () => {
    const state = [at(1, "team.message", { seq: 1, round: 1, from_role: "lead", text: "hi" })].reduce(applyEvent, emptyLiveState);
    const stage = Object.values(state.teams)[0];
    expect(teamProgressText(withLimits(stage, { max_rounds: 6, max_messages: 30 }))).toBe("第 0/6 轮 · 消息 1/30");
    expect(teamProgressText(withLimits(stage, null))).toBe("第 0 轮 · 消息 1");
    // What the events said wins over the node's.
    const told = [at(1, "team.round_started", { round: 1, max_rounds: 10, max_messages: 40 })].reduce(applyEvent, emptyLiveState);
    expect(teamProgressText(withLimits(Object.values(told.teams)[0], { max_rounds: 6, max_messages: 30 }))).toBe("第 1/10 轮 · 消息 0/40");
  });
});
