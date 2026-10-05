import { describe, expect, it } from "vitest";
import { roleName, approvalRoleLabel, catalogueLabel, groupPlan, isReviewNode, memberApprovalTitle, memberLabel, nodeRoles, reviewLabel, roleText, sopProgress, sopStepLabel, expertSummary, frameworkLabel, humanizeProfileRefs, nodeTitle, nodeTypeLabel, profileName, stripFrontmatter } from "./display";

/**
 * Ways the display layer can fail, each asserted below:
 *   D1 a profile ref (`id@version`) reaches the screen instead of the expert's name
 *   D2 an unknown ref leaks its id, or `default@1` is not called the default agent
 *   D3 frontmatter shows up in an expert description, or the description is lost when only frontmatter is there
 *   D4 a system node title, node type or catalogue stays in English / internal wording
 *   D5 an unmapped catalogue or framework tag is shown raw instead of hidden
 */

const experts = [
  { expert_id: "writer", ref: "writer@2", name: "文案专家" },
  { expert_id: "writer", ref: "writer@1", name: "文案专家" },
];

describe("profileName", () => {
  it("shows the expert's name for its exact ref (D1)", () => {
    expect(profileName("writer@2", experts)).toBe("文案专家");
  });
  it("shows the expert's name when only another version is known", () => {
    expect(profileName("writer@7", experts)).toBe("文案专家");
  });
  it("calls the built-in profile the default agent, whatever its version (D2)", () => {
    expect(profileName("default@1", [])).toBe("默认智能体");
    expect(profileName("default@3", experts)).toBe("默认智能体");
    expect(profileName("default", experts)).toBe("默认智能体");
    expect(profileName("", experts)).toBe("默认智能体");
    expect(profileName(undefined, experts)).toBe("默认智能体");
  });
  it("never leaks the id or version of an unknown profile (D2)", () => {
    const name = profileName("ghost@4", experts);
    expect(name).toBe("自定义专家");
    expect(name).not.toMatch(/ghost|@|\d/);
  });
});

describe("humanizeProfileRefs", () => {
  it("replaces every ref inside free text and leaves the rest alone (D1)", () => {
    const text = humanizeProfileRefs("switch default@1 -> writer@2 now, v2 stays, a@b too", (ref) => profileName(ref, experts));
    expect(text).toBe("switch 默认智能体 -> 文案专家 now, v2 stays, a@b too");
  });
});

describe("stripFrontmatter", () => {
  it("removes a YAML block at the top (D3)", () => {
    expect(stripFrontmatter("---\nname: Foo\ndescription: Does foo\n---\n# Body\ntext")).toBe("# Body\ntext");
  });
  it("removes frontmatter that was flattened onto one line (D3)", () => {
    expect(stripFrontmatter("--- name: Foo description: Does foo --- Real text")).toBe("Real text");
  });
  it("falls back to the description when nothing follows the frontmatter (D3)", () => {
    expect(stripFrontmatter("---\nname: Foo\ndescription: Does foo\n---\n")).toBe("Does foo");
    expect(stripFrontmatter("--- name: Foo description: Does foo ---")).toBe("Does foo");
  });
  it("drops an unterminated frontmatter block rather than showing it (D3)", () => {
    expect(stripFrontmatter("---\nname: Foo\ndescription: Does foo")).toBe("Does foo");
  });
  it("keeps ordinary text, including a horizontal rule in the middle", () => {
    expect(stripFrontmatter("Hello\n---\nWorld")).toBe("Hello\n---\nWorld");
    expect(stripFrontmatter("")).toBe("");
  });
});

describe("plan wording", () => {
  it("translates system node titles and keeps the agent's own (D4)", () => {
    expect(nodeTitle("Explore and plan")).toBe("理解目标并规划");
    expect(nodeTitle("Draft report")).toBe("Draft report");
  });
  it("gives the ordinary step no type label and never an English one (D4)", () => {
    expect(nodeTypeLabel("agent_turn")).toBe("");
    expect(nodeTypeLabel("something_new")).toBe("");
  });
});

describe("catalog labels", () => {
  it("maps known categories and frameworks to Chinese (D4)", () => {
    expect(catalogueLabel("development-tools")).toBe("开发工具");
    expect(catalogueLabel("others")).toBe("其他");
    expect(frameworkLabel("ms-agent")).toBe("魔搭智能体");
    expect(frameworkLabel("qwenpaw")).toBe("千问智能体");
  });
  it("hides what it cannot name (D5)", () => {
    expect(catalogueLabel("brand-new-thing")).toBe("");
    expect(frameworkLabel("some-framework")).toBe("");
    expect(frameworkLabel("")).toBe("");
  });
});

describe("expertSummary", () => {
  it("is one line without frontmatter (D3)", () => {
    expect(expertSummary("---\nname: Foo\ndescription: Does foo\n---\n# Role\nYou are\nhelpful.")).toBe("# Role You are helpful.");
    expect(expertSummary("")).toBe("");
  });
});

/**
 * Ways the SOP plan view can fail, each asserted below:
 *   S1 a SOP's nodes are listed beside the SOP node instead of under it, or a node of a compacted SOP vanishes
 *   S2 a nested agent-team node (parent but no sop_step) is swallowed into a SOP
 *   S3 the step label is not "name · 第 i/n 步 · subject", or the version leaks into it
 *   S4 approvals count as steps in the progress
 */
const sop = (role: string, index: number, status = "PENDING") => ({ node_id: `${role}${index}`, status, parent_node_id: "S", sop_step: { sop: "release@2", role, total: 2, index, subject: `s${index}` } });
describe("SOP plan view", () => {
  const nodes = [{ node_id: "N", status: "COMPLETED" }, { node_id: "S", status: "RUNNING" }, sop("approval_before", 1), sop("step", 1, "COMPLETED"), sop("step", 2), { node_id: "T", status: "PENDING", parent_node_id: "N" }];
  it("nests a SOP's nodes under it and leaves the rest alone (S1, S2)", () => {
    const groups = groupPlan(nodes);
    expect(groups.map((g) => g.node.node_id)).toEqual(["N", "S", "T"]);
    expect(groups[1].children.map((c) => c.node_id)).toEqual(["approval_before1", "step1", "step2"]);
    expect(groups[0].children).toEqual([]);
  });
  it("keeps the nodes of a SOP whose node is gone (S1)", () => {
    expect(groupPlan(nodes.filter((n) => n.node_id !== "S")).map((g) => g.node.node_id)).toContain("step1");
  });
  it("labels a step with the SOP's name, position and subject (S3)", () => {
    expect(sopStepLabel(sop("step", 2).sop_step)).toBe("release · 第 2/2 步 · s2");
    expect(approvalRoleLabel("approval_after")).toBe("步骤完成后");
    expect(approvalRoleLabel("step")).toBe("");
  });
  it("counts steps, not approvals (S4)", () => {
    expect(sopProgress(groupPlan(nodes)[1].children)).toEqual({ done: 1, total: 2 });
  });
});

/**
 * Ways the team wording can fail, each asserted below:
 *   T1 a role id reaches the screen when the member has a label, or a member from before labels shows nothing
 *   T2 the leader is labelled by what its role was named (`lead`), not by its label or as the leader
 *   T3 a node the leader gave to a member is attributed to the leader (or the other way round) when both use one expert
 *   T4 a review is not numbered by the round the workflow gave it, or one without a round shows a made-up number
 *   T5 a node nobody owns in the team gets a role anyway
 *   T6 the approval of a member does not name the member
 */
describe("team roles", () => {
  const team = {
    leader: "lead",
    members: [
      { role: "lead", expert: "writer@1", name: "撰稿专家", label: "主编" },
      { role: "member-2", expert: "research@3", name: "调研专家", label: "研究员" },
      { role: "member-3", expert: "writer@1", name: "撰稿专家", label: "审校" },
    ],
  };
  const node = (id: string, owner: string | null, extra: Record<string, unknown> = {}) => ({ node_id: id, type: "agent_turn", title: id, owner_profile: owner, parent_node_id: null, ...extra });

  it("shows the label a person gave, and the role id only when there is none (T1)", () => {
    expect(roleName("member-2", "研究员")).toBe("研究员");
    expect(roleName("researcher", "")).toBe("researcher");
    expect(roleName("researcher", undefined)).toBe("researcher");
    expect(roleName("lead", "", "lead")).toBe("领队");
    expect(roleName("lead", "主编", "lead")).toBe("主编");
    expect(memberLabel("研究员", "调研专家")).toBe("研究员 · 调研专家");
    expect(reviewLabel(2)).toBe("领队复盘 · 第 2 轮");
    expect(memberApprovalTitle("研究员")).toBe("成员 研究员 请求确认");
  });

  it("labels the leader with its label, or as the leader when it has none, never by its role id (T2)", () => {
    const roles = nodeRoles(team, [node("n1", "writer@1")]);
    expect(roles.n1).toMatchObject({ kind: "leader", role: "lead", name: "撰稿专家" });
    expect(roleText(roles.n1)).toBe("主编 · 撰稿专家");
    const bare = nodeRoles({ leader: "lead", members: [{ role: "lead", expert: "writer@1", name: "撰稿专家" }] }, [node("n1", "writer@1")]);
    expect(roleText(bare.n1)).toBe("领队 · 撰稿专家");
  });

  it("attributes a node to the member whose expert runs it, by label (T3)", () => {
    const roles = nodeRoles(team, [node("n1", "research@3", { parent_node_id: "n0" })]);
    expect(roles.n1).toMatchObject({ kind: "member", role: "member-2" });
    expect(roleText(roles.n1)).toBe("研究员 · 调研专家");
  });

  it("tells a leader's own node from a member's when both run as one expert: the nested one is the member's (T3)", () => {
    const roles = nodeRoles(team, [node("own", "writer@1"), node("given", "writer@1", { parent_node_id: "own" })]);
    expect(roles.own.kind).toBe("leader");
    expect(roles.given).toMatchObject({ kind: "member", role: "member-3" });
    expect(roleText(roles.given)).toBe("审校 · 撰稿专家");
  });

  it("numbers a review by the round the workflow gave it (T4)", () => {
    const roles = nodeRoles(team, [node("a", "writer@1"), node("r1", "writer@1", { title: "领队复盘", review_round: 1 }), node("r2", "writer@1", { title: "领队复盘", review_round: 2 }), node("r3", "writer@1", { title: "领队复盘", review_round: 1 })]);
    expect([roles.r1.round, roles.r2.round, roles.r3.round]).toEqual([1, 2, 1]);
    expect(roleText(roles.r2)).toBe("领队复盘 · 第 2 轮");
    expect(roles.r1).toMatchObject({ kind: "review", name: "撰稿专家" });
  });

  it("does not invent a round for a review the workflow gave none (T4)", () => {
    const roles = nodeRoles(team, [node("r", "writer@1", { title: "领队复盘" })]);
    expect(roles.r.round).toBeUndefined();
    expect(roleText(roles.r)).toBe("领队复盘");
  });

  it("gives a task without a team the reviews and nothing else (T4)", () => {
    const roles = nodeRoles(null, [node("a", "writer@1"), node("r", "writer@1", { title: "领队复盘", review_round: 1 })]);
    expect(Object.keys(roles)).toEqual(["r"]);
    expect(roles.r).toMatchObject({ kind: "review", round: 1, name: "" });
  });

  it("leaves a node owned by nobody in the team without a role (T5)", () => {
    expect(nodeRoles(team, [node("n1", "stranger@1"), node("n2", null), node("n3", "default@1")])).toEqual({});
  });

  it("takes a node marked with a review round for a review, and a team stage with the review's title for none (T4)", () => {
    expect(isReviewNode({ type: "team_stage", title: "领队复盘" })).toBe(false);
    expect(isReviewNode({ type: "agent_turn", title: "领队复盘" })).toBe(true);
    expect(isReviewNode({ type: "agent_turn", title: "something else", review_round: 3 })).toBe(true);
  });
});
