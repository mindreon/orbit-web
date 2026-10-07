import { describe, expect, it } from "vitest";
import { buildChat, finalAnswerId, firstSentence, groupChat, mainChat, memberThread, mentionColor, parseMentions, splitMentions, type ChatTeam } from "./chat";
import { applyEvent, emptyLiveState } from "./taskEvents";
import type { Task, TaskEvent } from "./tasks";

/**
 * Ways the group chat can fail, each asserted below:
 *   G1 bubbles are out of order (by seq), doubled by a replay, or a user's message is shown twice (message.user and its team.message)
 *   G2 a speaker's bubbles are not grouped under one header, or two speakers are, or a user/system line joins a group
 *   G3 a member's tool calls, thinking or streamed text land under another member's bubble (two members share one attempt id)
 *   G4 a member's work is shown twice (under its reply and again as a live bubble), or an in-progress turn has no bubble
 *   G5 a mention is missed, is found inside a longer word, is not found by its label or role id, or colours differ between runs
 *   G6 a plan-level reply is shown twice (its attempt and its message), or the attempt's steps are lost
 *   G7 a review is not marked with its round, or a system notice is shown as a speaker
 *   G8 an approval card is not placed where it was asked, or a stage's attributed events leak into a plan-level bubble
 */
const team: ChatTeam = {
  leader: "member-1",
  members: [
    { role: "member-1", label: "主编", expert: "w@1", name: "撰稿专家" },
    { role: "member-2", label: "研究员", expert: "r@1", name: "调研专家" },
    { role: "member-3", label: "审校", expert: "e@1", name: "编辑专家" },
  ],
};
const task = { task_id: "t", goal: "g", created_at: "2026-10-05T00:00:00Z" } as Task;
let n = 0;
const ev = (seq: number, type: string, payload: Record<string, unknown>): TaskEvent => {
  n += 1;
  return { seq, event_id: `e${n}`, task_id: "t", type, source: "workflow", payload, occurred_at: "2026-10-05T00:00:00Z" };
};
const eph = (after: number, type: string, payload: Record<string, unknown>): TaskEvent => ({ ...ev(0, type, payload), after_seq: after });
const msg = (seq: number, kind: string, from: string, to: string[], text: string, extra: Record<string, unknown> = {}) =>
  ev(seq, "team.message", { node_id: "n_stage", attempt_id: "att_s", seq, kind, from_role: from, from_label: team.members.find((m) => m.role === from)?.label ?? "", to_roles: to, text, round: 1, hop: 0, artifacts: [], ...extra });
const chat = (events: TaskEvent[], extra: Partial<Parameters<typeof buildChat>[0]> = {}) => {
  const sorted = [...events].sort((a, b) => (a.seq || a.after_seq! + 0.5) - (b.seq || b.after_seq! + 0.5));
  return buildChat({ task, events: sorted, live: sorted.reduce(applyEvent, emptyLiveState), team, nameOf: (ref) => ref, nodes: [], roles: {}, ...extra });
};
const bubbles = (items: ReturnType<typeof chat>) => items.filter((item) => item.type === "bubble");

describe("ordering and duplicates", () => {
  it("orders bubbles by seq, whatever the order they were given in (G1)", () => {
    const items = chat([msg(5, "reply", "member-2", ["member-1"], "second"), msg(3, "assign", "member-1", ["member-2"], "first")]);
    expect(bubbles(items).map((b) => b.type === "bubble" && b.text)).toEqual(["first", "second"]);
  });

  it("shows a user's message once: from message.user, not again from its team.message (G1)", () => {
    const items = chat([ev(1, "message.user", { text: "@研究员 查一下", mentions: ["member-2"] }), msg(2, "user", "user", ["member-2"], "查一下")]);
    expect(items.map((i) => i.type)).toEqual(["user"]);
    expect(items[0]).toMatchObject({ type: "user", mentions: ["member-2"], text: "@研究员 查一下" });
  });

  it("starts with the goal the task was created with (G1)", () => {
    const items = chat([ev(1, "task.created", { goal: "写一份摘要" })]);
    expect(items[0]).toMatchObject({ type: "user", text: "写一份摘要", mentions: [] });
  });
});

describe("grouping by speaker", () => {
  it("puts consecutive bubbles of one speaker under one header and splits at another speaker (G2)", () => {
    const groups = groupChat(chat([msg(1, "assign", "member-1", ["member-2"], "a"), msg(2, "assign", "member-1", ["member-3"], "b"), msg(3, "reply", "member-2", ["member-1"], "c"), msg(4, "reply", "member-1", [], "d")]));
    expect(groups.map((g) => [g.type === "bubbles" ? g.speaker.role : g.type, g.items.length])).toEqual([["member-1", 2], ["member-2", 1], ["member-1", 1]]);
  });

  it("keeps user and system lines out of a speaker's group (G2, G7)", () => {
    const groups = groupChat(chat([msg(1, "assign", "member-1", ["member-2"], "a"), msg(2, "system", "system", ["member-2"], "跳数上限"), msg(3, "assign", "member-1", ["member-3"], "b"), ev(4, "message.user", { text: "hi" })]));
    expect(groups.map((g) => g.type)).toEqual(["bubbles", "system", "bubbles", "user"]);
  });

  it("marks the leader and names each speaker by label and expert (G2)", () => {
    const [first, second] = bubbles(chat([msg(1, "assign", "member-1", ["member-2"], "a"), msg(2, "reply", "member-2", ["member-1"], "b")]));
    expect(first).toMatchObject({ speaker: { role: "member-1", label: "主编", name: "撰稿专家", leader: true } });
    expect(second).toMatchObject({ speaker: { role: "member-2", label: "研究员", name: "调研专家", leader: false }, to: ["member-1"] });
  });

  it("shows a system message as a notice, not a speaker (G7)", () => {
    const items = chat([msg(1, "system", "system", ["member-2"], "本轮的唤醒已到 3 跳上限")]);
    expect(items).toMatchObject([{ type: "system", text: "本轮的唤醒已到 3 跳上限" }]);
  });
});

describe("stream attribution", () => {
  const stage = (type: string, seq: number, role: string, payload: Record<string, unknown> = {}) => {
    const attributed = { attempt_id: "att_s", team_role: role, team_label: team.members.find((m) => m.role === role)!.label, team_session: `sess-${role}`, ...payload };
    return seq > 0 ? ev(seq, type, attributed) : eph(0, type, attributed);
  };

  it("gives two concurrent members each their own steps, thinking and streamed text (G3)", () => {
    const items = chat([
      eph(1, "agent.token_delta", { attempt_id: "att_s", team_role: "member-2", team_session: "sess-member-2", block_id: "b", text: "我在查" }),
      eph(1, "agent.token_delta", { attempt_id: "att_s", team_role: "member-3", team_session: "sess-member-3", block_id: "b", text: "我在改" }),
      eph(1, "agent.thinking_delta", { attempt_id: "att_s", team_role: "member-2", team_session: "sess-member-2", block_id: "t", text: "先看来源" }),
      stage("tool.call_started", 2, "member-2", { tool_call_id: "c1", tool_name: "Read" }),
      stage("tool.call_started", 3, "member-3", { tool_call_id: "c2", tool_name: "Write" }),
      stage("tool.call_finished", 4, "member-2", { tool_call_id: "c1", tool_name: "Read", state: "success" }),
    ]);
    const live = bubbles(items).filter((b) => b.type === "bubble" && b.live);
    expect(live.map((b) => b.type === "bubble" && b.speaker.role).sort()).toEqual(["member-2", "member-3"]);
    const researcher = live.find((b) => b.type === "bubble" && b.speaker.role === "member-2")!;
    const editor = live.find((b) => b.type === "bubble" && b.speaker.role === "member-3")!;
    expect(researcher.type === "bubble" && researcher.work).toMatchObject({ text: "我在查", thinking: "先看来源" });
    expect(researcher.type === "bubble" && researcher.work?.steps.map((s) => [s.tool, s.state])).toEqual([["Read", "success"]]);
    expect(editor.type === "bubble" && editor.work?.text).toBe("我在改");
    expect(editor.type === "bubble" && editor.work?.steps.map((s) => [s.tool, s.state])).toEqual([["Write", "running"]]);
  });

  it("moves a member's work under its reply, once, and starts the next turn empty (G3, G4)", () => {
    const items = chat([
      stage("tool.call_started", 1, "member-2", { tool_call_id: "c1", tool_name: "Read" }),
      stage("tool.call_finished", 2, "member-2", { tool_call_id: "c1", tool_name: "Read", state: "success" }),
      stage("tool.call_started", 3, "member-3", { tool_call_id: "c9", tool_name: "Write" }),
      msg(4, "reply", "member-2", ["member-1"], "查完了"),
    ]);
    const all = bubbles(items).filter((b): b is Extract<typeof b, { type: "bubble" }> => b.type === "bubble");
    const reply = all.find((b) => !b.live)!;
    expect(reply.work?.steps.map((s) => s.tool)).toEqual(["Read"]);
    const live = all.filter((b) => b.live);
    expect(live).toHaveLength(1);
    expect(live[0].speaker.role).toBe("member-3");
    expect(live[0].work?.steps.map((s) => s.tool)).toEqual(["Write"]);
  });

  it("does not take a note for the end of a turn: the work stays with the member until it answers (G4)", () => {
    const items = chat([stage("tool.call_started", 1, "member-2", { tool_call_id: "c1", tool_name: "Read" }), msg(2, "note", "member-2", [], "先记一笔")]);
    const all = bubbles(items).filter((b): b is Extract<typeof b, { type: "bubble" }> => b.type === "bubble");
    expect(all.find((b) => !b.live)?.work).toBeUndefined();
    expect(all.find((b) => b.live)?.work?.steps).toHaveLength(1);
  });

  it("has no live bubble for a member that has done nothing yet (G4)", () => {
    expect(bubbles(chat([msg(1, "assign", "member-1", ["member-2"], "查一下")]))).toHaveLength(1);
  });

  it("keeps a stage's attributed events out of a plan-level bubble of the same attempt (G8)", () => {
    const events = [
      ev(1, "attempt.started", { attempt_id: "att_s", node_id: "n_stage", attempt_no: 1, profile: "w@1" }),
      stage("tool.call_started", 2, "member-2", { tool_call_id: "c1", tool_name: "Read" }),
    ];
    const items = chat(events, { stageNodeIds: new Set(["n_stage"]), roles: { n_stage: { kind: "leader", role: "member-1", label: "主编", expert: "w@1", name: "撰稿专家" } } });
    const own = bubbles(items).filter((b) => b.type === "bubble" && !b.live);
    expect(own).toHaveLength(0);
  });
});

describe("plan-level attempts", () => {
  const roles = { n_a: { kind: "member" as const, role: "member-2", label: "研究员", expert: "r@1", name: "调研专家" }, n_lead: { kind: "leader" as const, role: "member-1", label: "主编", expert: "w@1", name: "撰稿专家" } };
  const attempt = (seq: number, id: string, node: string, text: string, tools = 1) => [
    ev(seq, "attempt.started", { attempt_id: id, node_id: node, attempt_no: 1, profile: "r@1" }),
    ...Array.from({ length: tools }, (_, i) => ev(seq + 1 + i, "tool.call_finished", { attempt_id: id, tool_call_id: `${id}-${i}`, tool_name: "Read", state: "success" })),
    ev(seq + 1 + tools, "message.agent_final", { attempt_id: id, text }),
    ev(seq + 2 + tools, "attempt.finished", { attempt_id: id, node_id: node, outcome: "completed" }),
  ];

  it("shows a member's node once, as its reply message, with the attempt's steps under it (G6)", () => {
    const events = [...attempt(1, "att_a", "n_a", "三项风险"), msg(9, "reply", "member-2", ["member-1"], "三项风险", { node_id: "n_a", attempt_id: "att_a", round: 0 })];
    const all = bubbles(chat(events, { roles }));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ type: "bubble", kind: "reply", text: "三项风险" });
    expect(all[0].type === "bubble" && all[0].work?.steps).toHaveLength(1);
  });

  it("shows an attempt with no message yet as the owner's bubble: the leader's exploration, a member still running (G6)", () => {
    const events = [...attempt(1, "att_l", "n_lead", "我来拆任务"), ev(20, "attempt.started", { attempt_id: "att_m", node_id: "n_a", attempt_no: 1, profile: "r@1" })];
    const all = bubbles(chat(events, { roles })).filter((b): b is Extract<typeof b, { type: "bubble" }> => b.type === "bubble");
    expect(all.map((b) => [b.speaker.role, b.text, b.status])).toEqual([["member-1", "我来拆任务", "completed"], ["member-2", "", "running"]]);
    expect(all[0].work?.steps).toHaveLength(1);
  });

  it("puts what the leader did after the user's answer under that answer, not at the attempt's start (G1, G6)", () => {
    const events = [
      ev(1, "attempt.started", { attempt_id: "att_l", node_id: "n_lead", attempt_no: 1, profile: "w@1" }),
      ev(2, "tool.call_started", { attempt_id: "att_l", tool_call_id: "ask", tool_name: "ask_user" }),
      ev(3, "attempt.parked", { attempt_id: "att_l", reason: "input" }),
      ev(4, "message.user", { text: "用 React" }),
      ev(5, "tool.call_finished", { attempt_id: "att_l", tool_call_id: "w1", tool_name: "Write", state: "success" }),
    ];
    const order = chat(events, { roles }).map((i) => (i.type === "user" ? `user:${i.text}` : i.type === "bubble" ? `bubble:${i.work?.steps.map((s) => s.tool).join(",")}` : i.type));
    expect(order).toEqual(["bubble:ask_user", "user:用 React", "bubble:Write"]);
  });

  it("labels a review with its round from the node (G7)", () => {
    const reviewRoles = { n_r: { kind: "review" as const, role: "member-1", label: "主编", expert: "w@1", name: "撰稿专家", round: 2 } };
    const events = [...attempt(1, "att_r", "n_r", "还差一点"), msg(9, "review", "member-1", [], "还差一点", { node_id: "n_r", attempt_id: "att_r", round: 0 })];
    const [b] = bubbles(chat(events, { roles: reviewRoles }));
    expect(b).toMatchObject({ type: "bubble", kind: "review", reviewRound: 2 });
  });
});

describe("approvals", () => {
  it("places an approval card where it was asked, between the bubbles around it (G8)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-2"], "a"), ev(2, "approval.requested", { approval_id: "apr_1", node_id: "n_stage", subject: { kind: "tool_call", summary: "member-2: Bash", role: "member-2" } }), msg(3, "reply", "member-2", [], "b")]);
    expect(items.map((i) => i.type)).toEqual(["bubble", "approval", "bubble"]);
    expect(items[1]).toMatchObject({ type: "approval", approvalId: "apr_1" });
  });
});

describe("mentions", () => {
  const members = team.members;
  it("finds a mention by label or by role id, once each, in the order of the team (G5)", () => {
    expect(parseMentions("@研究员 和 @member-3 看看，@研究员 再来", members)).toEqual(["member-2", "member-3"]);
  });
  it("does not find a mention inside a longer word or an email (G5)", () => {
    expect(parseMentions("发给 a@member-2 和 @member-22 吧", members)).toEqual([]);
    expect(parseMentions("没有提到谁", members)).toEqual([]);
  });
  it("takes the longest name when one is the start of another (G5)", () => {
    const names = [{ role: "a", label: "研究", expert: "x@1", name: "" }, { role: "b", label: "研究员", expert: "y@1", name: "" }];
    expect(parseMentions("@研究员 来", names)).toEqual(["b"]);
  });
  it("splits text into plain and mention parts without losing a character (G5)", () => {
    const parts = splitMentions("请 @研究员 查，再让 @审校 看", members);
    expect(parts.map((p) => (p.role ? `[${p.role}]` : p.text)).join("")).toBe("请 [member-2] 查，再让 [member-3] 看");
    expect(parts.map((p) => p.text).join("")).toBe("请 @研究员 查，再让 @审校 看");
    expect(splitMentions("没有", members)).toEqual([{ text: "没有" }]);
  });
  it("gives a member the same colour every time, and different members different colours up to the palette (G5)", () => {
    expect(mentionColor("member-2", team)).toBe(mentionColor("member-2", team));
    expect(new Set(team.members.map((m) => mentionColor(m.role, team))).size).toBe(3);
    expect(mentionColor("stranger", team)).toBeTypeOf("number");
  });
});

describe("the main chat: the leader and summaries", () => {
  const full = () =>
    chat([
      ev(1, "task.created", { goal: "写报告" }),
      msg(2, "assign", "member-1", ["member-2"], "你是研究员，背景……共 5 项任务", { at: 1 }),
      msg(3, "assign", "member-1", ["member-3"], "你是审校"),
      msg(4, "reply", "member-2", ["member-1"], "调研完成"),
      msg(5, "review", "member-1", [], "第一轮看了。还要补充数据。", { node_id: "n_r1" }),
      msg(6, "assign", "member-1", ["member-2"], "补充数据"),
      msg(7, "reply", "member-2", ["member-1"], "补好了"),
      msg(8, "review", "member-1", [], "最终结论：完成。", { node_id: "n_r2" }),
    ]);

  it("hides assignments and member replies, leaving one roster after the user's message (M1)", () => {
    const main = mainChat(full(), team);
    expect(main.map((item) => item.type)).toEqual(["user", "roster", "bubble", "bubble"]);
    expect(main.filter((item) => item.type === "bubble").map((item) => item.type === "bubble" && item.speaker.leader)).toEqual([true, true]);
  });

  it("lists each member once with how its work stands (M2)", () => {
    const roster = mainChat(full(), team).find((item) => item.type === "roster");
    expect(roster?.type === "roster" && roster.members.map((m) => [m.role, m.status])).toEqual([
      ["member-2", "done"],
      ["member-3", "waiting"],
    ]);
  });

  it("a member that was given work again after replying is back at work, not done (M3)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-2"], "a"), msg(2, "reply", "member-2", ["member-1"], "b"), msg(3, "assign", "member-1", ["member-2"], "c")]);
    const roster = mainChat(items, team)[0];
    expect(roster.type === "roster" && roster.members[0].status).toBe("waiting");
  });

  it("the leader's own work is not member work: its turns stay in the chat and an assignment to itself leaves no empty roster (M7)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-1"], "我自己来"), msg(2, "reply", "member-1", [], "做完了")]);
    expect(mainChat(items, team).map((item) => item.type)).toEqual(["bubble"]);
  });

  it("a new user message starts a new roster (M4)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-2"], "a"), ev(2, "message.user", { text: "再来", mentions: [] }), msg(3, "assign", "member-1", ["member-3"], "b")]);
    expect(mainChat(items, team).map((item) => item.type)).toEqual(["roster", "user", "roster"]);
  });

  it("the leader's last word is the final answer; folded review lines take the first sentence (M5)", () => {
    const main = mainChat(full(), team);
    const last = main.filter((item) => item.type === "bubble").at(-1)!;
    expect(finalAnswerId(main)).toBe(last.id);
    expect(firstSentence("## 复盘\n第一轮看了。还要补充数据。")).toBe("复盘 第一轮看了。");
    expect(firstSentence("x".repeat(100))).toHaveLength(81);
  });

  it("a member's reply to the leader never reaches the main chat, only the leader's review of it does (M8)", () => {
    const main = mainChat(chat([msg(1, "assign", "member-1", ["member-2"], "查一下"), msg(2, "reply", "member-2", ["member-1"], "整体采用 FastAPI 的四层结构"), msg(3, "review", "member-1", [], "后端已经好了：四层结构。", { node_id: "n_r1" })]), team);
    const text = main.flatMap((item) => (item.type === "bubble" ? [item.text] : item.type === "system" ? [item.text] : []));
    expect(text).toEqual(["后端已经好了：四层结构。"]);
    expect(main.map((item) => item.type)).toEqual(["roster", "bubble"]);
  });

  it("a member's reply to the user stays in its thread: the main chat gets one quiet line naming it, not the report (M9)", () => {
    const items = chat([ev(1, "message.user", { text: "@研究员 介绍下实现", mentions: ["member-2"] }), msg(2, "reply", "member-2", ["user"], "整体采用 FastAPI + Pydantic 的标准结构，分为四层", { node_id: "n_m" })]);
    const main = mainChat(items, team);
    expect(main.map((item) => item.type)).toEqual(["user", "roster", "system"]);
    const notice = main.at(-1);
    expect(notice?.type === "system" && notice.text).toBe("研究员 已回复你，点上面的成员查看");
    expect(main.some((item) => item.type === "bubble")).toBe(false);
    expect(memberThread(items, "member-2")[0].bubbles.map((b) => [b.kind, b.to, b.text])).toEqual([["reply", ["user"], "整体采用 FastAPI + Pydantic 的标准结构，分为四层"]]);
  });

  it("a member's note to another member or a reply still working leaves no line in the main chat (M10)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-2"], "a"), msg(2, "note", "member-2", ["member-3"], "@审校 看下"), msg(3, "reply", "member-3", ["member-2"], "好")]);
    expect(mainChat(items, team).map((item) => item.type)).toEqual(["roster"]);
  });

  it("a member's thread is its assignments with what it did after each, and the time it took (M6)", () => {
    const items = chat([msg(1, "assign", "member-1", ["member-2"], "a", { }), msg(2, "reply", "member-2", ["member-1"], "b")].map((e, i) => ({ ...e, occurred_at: `2026-10-05T00:00:${i === 0 ? "00" : "42"}Z` })));
    const sections = memberThread(items, "member-2");
    expect(sections).toHaveLength(1);
    expect(sections[0].assign?.text).toBe("a");
    expect(sections[0].bubbles.map((b) => b.text)).toEqual(["b"]);
    expect(sections[0].seconds).toBe(42);
    expect(memberThread(items, "member-3")).toEqual([]);
  });
});
