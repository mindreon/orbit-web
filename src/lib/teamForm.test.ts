import { expect, it } from "vitest";
import { addedRow, blankTeamForm, hasProblems, parseRosterNotes, teamFiles, validateTeam, type TeamExpert, type TeamForm } from "./teamForm";

const writer: TeamExpert = { id: "w", publisher: "dev", name: "writer", display_name: "写手", description: "把资料写成文章" };
const researcher: TeamExpert = { id: "r", publisher: "dev", name: "researcher", display_name: "研究员", description: "检索公开资料" };

function ready(extra?: Partial<TeamForm>): TeamForm {
  const form = blankTeamForm();
  const second = addedRow(form);
  return {
    ...form,
    name: "内容小队",
    members: [
      { ...form.members[0], label: "研究员", expert: "r", description: "" },
      { ...second, label: "写手", expert: "w", description: "根据资料成稿" },
    ],
    ...extra,
  };
}

it("starts with one leader row", () => {
  const form = blankTeamForm();
  expect(form.members).toHaveLength(1);
  expect(form.leader).toBe(form.members[0].key);
  expect(form.members[0].role).toBe("member-1");
  expect(form.members[0].label).toBe("领队");
});

it("gives the next member a free role id", () => {
  const form = blankTeamForm();
  expect(addedRow({ ...form, members: [{ ...form.members[0], role: "member-2" }] }).role).toBe("member-1");
});

it("points at an empty name, a missing expert and a duplicate role", () => {
  const form = ready();
  const duplicate = { ...form.members[1], role: form.members[0].role };
  const problems = validateTeam({ ...form, name: "  ", members: [{ ...form.members[0], expert: "" }, duplicate] }, [writer, researcher]);
  expect(problems.name).toBe("请填写专家团的名称。");
  expect(problems.rows[form.members[0].key]?.expert).toBe("请选择这位成员由哪位专家担任。");
  expect(problems.rows[duplicate.key]?.role).toBe("角色 ID 不能重复。");
  expect(hasProblems(problems)).toBe(true);
});

it("rejects a reserved role id and an unknown expert", () => {
  const form = ready();
  const problems = validateTeam(
    { ...form, members: [{ ...form.members[0], role: "team", expert: "missing" }] },
    [writer],
  );
  expect(problems.rows[form.members[0].key]?.role).toMatch(/保留/);
  expect(problems.rows[form.members[0].key]?.expert).toMatch(/不存在/);
});

it("writes the role id into team.json and the display name into members.json", () => {
  const form = ready();
  const files = teamFiles(form, [writer, researcher]);
  const team = JSON.parse(files["team.json"]) as { name: string; description: string; roles: { name: string; role: string; agent: string }[] };
  expect(team.description).toBe("内容小队");
  expect(team.name).toMatch(/^ex-[0-9a-f]{8}$/);
  expect(team.roles.map((role) => role.role)).toEqual(["leader", "teammate"]);
  expect(team.roles[0]).toMatchObject({ name: "member-1", agent: "dev/researcher@^1.0.0" });
  expect(team.roles[1]).toMatchObject({ name: "member-2", agent: "dev/writer@^1.0.0" });
  expect(parseRosterNotes(files["members.json"])).toEqual([
    { name: "member-1", label: "研究员", description: "" },
    { name: "member-2", label: "写手", description: "根据资料成稿" },
  ]);
  expect(files["AGENTS.md"]).toContain("研究员，领队");
  expect(files["AGENTS.md"]).toContain("检索公开资料");
  expect(files["AGENTS.md"]).toContain("根据资料成稿");
});

it("keeps an ascii team name as the asset slug", () => {
  const files = teamFiles(ready({ name: "content-squad" }), [writer, researcher]);
  expect(JSON.parse(files["team.json"]).name).toBe("content-squad");
});

it("ignores a broken roster file", () => {
  expect(parseRosterNotes("")).toEqual([]);
  expect(parseRosterNotes("{")).toEqual([]);
  expect(parseRosterNotes('{"members":[{"label":"缺名字"}]}')).toEqual([]);
});
