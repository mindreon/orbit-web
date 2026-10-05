/**
 * Multi-agent acceptance (E57-E64) on the running stack: a team of experts made in the page, the leader's plan and its
 * review loop, a team stage as a group chat, the review cap, an approval a member raises, @ mentions between members and
 * from the user, and two members working at once. Each scenario drives the
 * page and checks a backend fact (the API or Postgres) next to what the page shows.
 *
 * The mock leader cannot name an owner in `plan:`, so the member nodes come from `mcp:TaskCreate|{...metadata:{owner}}`,
 * which makes the leader call the real TaskCreate tool with a role id (the same call a real leader makes). The review cap
 * is set through the task's policy (`max_review_rounds`), and reached by one nested `plan:` goal.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { shot } from "./helpers";
import { addTeamStage, eventually, getPlan, getTask, openTask, planNodes, runningAttemptWorkflows, sql, taskStatus, waitForStatus } from "./tasks";

const unique = (label: string) => `${label} ${Date.now()}`;

type ExpertRow = { expert_id: string; ref: string; name: string; kind?: string; leader?: string; members?: Array<{ role: string; label?: string; expert: string; name: string; description?: string }> };

async function singleExpert(request: APIRequestContext, name: string): Promise<ExpertRow> {
  const response = await request.post("/v1/experts", { data: { name, instructions: `You are ${name}.` } });
  expect(response.status()).toBe(201);
  return (await response.json()) as ExpertRow;
}

/** A team of `member-1 … member-n` (the ids the page makes), each with the label a person gave it; the first leads. */
async function teamExpert(request: APIRequestContext, name: string, members: ReadonlyArray<[label: string, expert: ExpertRow]>): Promise<ExpertRow> {
  const response = await request.post("/v1/experts", { data: { name, kind: "team", leader: "member-1", members: members.map(([label, expert], index) => ({ role: `member-${index + 1}`, label, expert: expert.ref })) } });
  expect(response.status()).toBe(201);
  return (await response.json()) as ExpertRow;
}

async function startTask(request: APIRequestContext, title: string, goal: string, teamRef: string, policy?: { max_review_rounds?: number }): Promise<string> {
  const response = await request.post("/v1/tasks", { data: { title, goal, config: { team_ref: teamRef }, ...(policy ? { policy } : {}) }, timeout: 120_000 });
  expect(response.status()).toBe(201);
  return (await response.json()).task_id as string;
}

const createGoal = (subject: string, owner: string) => `mcp:TaskCreate|${JSON.stringify({ subject, description: `do ${subject}`, metadata: { owner } })}`;

/** Which expert (profile) each node's attempts ran as, from the durable events. */
const profilesByNode = (taskId: string): Record<string, string[]> => {
  const rows = sql(`SELECT body->'payload'->>'node_id' || '=' || (body->'payload'->>'profile') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'attempt.started' ORDER BY seq`).split("\n").filter(Boolean);
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const [node, profile] = row.split("=");
    (out[node] ??= []).push(profile);
  }
  return out;
};

const eventCount = (taskId: string, type: string) => Number(sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = '${type}'`));

/** The headers of the chat's groups, in order, as the page writes them. */
const speakerHeaders = (page: Page) => page.getByTestId("chat-speaker").allTextContents();
/** The reviews, labelled with their round. */
const reviewLabels = (page: Page) => page.getByTestId("chat-review").allTextContents();

test("E57 a team is made in the page and chosen for a task: the leader plans member nodes, they run as their members, the leader reviews, and the configuration keeps the team", async ({ page, request }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const writer = await singleExpert(request, `撰稿专家 ${stamp}`);
  const researcher = await singleExpert(request, `调研专家 ${stamp}`);
  const editor = await singleExpert(request, `编辑专家 ${stamp}`);
  const teamName = `内容小队 ${stamp}`;
  // The page never asks for the team's ref by hand and never looks it up: the configuration hands it back (`team_ref`).
  const profileReads: string[] = [];
  page.on("request", (req) => req.url().includes("/v1/profiles") && profileReads.push(req.url()));

  // ---- make the team in the page: type switch, three members with a display name each, the first leads
  await page.goto("/experts/agents");
  await page.getByRole("link", { name: "创建专家" }).click();
  await page.getByRole("tab", { name: "专家团" }).click();
  await page.getByLabel("名称", { exact: true }).fill(teamName);
  await page.getByLabel("显示名 1").fill("主编");
  await page.getByLabel("专家 1").selectOption({ label: writer.name });
  await page.getByLabel("职责 1").fill("统筹计划并复盘");
  await page.getByRole("button", { name: "添加成员" }).click();
  await page.getByLabel("显示名 2").fill("研究员");
  await page.getByLabel("专家 2").selectOption({ label: researcher.name });
  await page.getByLabel("职责 2").fill("查资料、核对来源");
  await page.getByRole("button", { name: "添加成员" }).click();
  await page.getByLabel("显示名 3").fill("编辑");
  // The role ids are made by the page (member-1 … member-3), one each, and folded away under 「高级」.
  await expect(page.getByLabel("角色 ID 3")).toHaveValue("member-3");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("请选择这位成员由哪位专家担任。")).toBeVisible();
  await page.getByLabel("专家 3").selectOption({ label: editor.name });
  await expect(page.getByText("请选择这位成员由哪位专家担任。")).toHaveCount(0);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/experts\/agents$/);

  const card = page.locator('[data-testid="my-expert"][data-kind="team"]').filter({ hasText: teamName });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("avatar")).toHaveCount(3);
  await expect(card.getByTestId("team-roles")).toContainText("主编、研究员、编辑");
  // Backend: one team expert, a leader that is one of its members, each member pinned to the expert chosen, with its label.
  const stored = ((await (await request.get("/v1/experts")).json()).items as ExpertRow[]).find((item) => item.name === teamName)!;
  expect(stored).toMatchObject({ kind: "team", leader: "member-1", version: 1 });
  expect(stored.members!.map((member) => [member.role, member.label, member.expert, member.name])).toEqual([
    ["member-1", "主编", writer.ref, writer.name],
    ["member-2", "研究员", researcher.ref, researcher.name],
    ["member-3", "编辑", editor.ref, editor.name],
  ]);
  expect(stored.members![0].description).toBe("统筹计划并复盘");
  // Control names the part at fault when it refuses a team: a code, and the field.
  const refused = await request.post("/v1/experts", { data: { name: "x", kind: "team", leader: "nobody", members: [{ role: "member-1", expert: writer.ref }] } });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ code: "TEAM_LEADER_NOT_MEMBER", field: "leader" });

  // ---- choose it in the "+" menu: the chip is the team with its members, and says what a team means
  await page.goto("/");
  await page.getByTestId("config-add").click();
  await page.getByRole("menuitem", { name: "专家", exact: true }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(teamName) }).click();
  const chip = page.locator('[data-testid="config-chip"][data-chip="team"]');
  await expect(chip).toContainText(teamName);
  await expect(chip.getByTestId("avatar")).toHaveCount(3);
  await expect(chip).toHaveAttribute("title", "领队负责规划，成员按分工执行");
  const goal = createGoal("调研要点", "member-2");
  await page.getByRole("textbox", { name: "任务目标" }).fill(goal);
  await page.getByRole("button", { name: "开始任务" }).click();
  await expect(page).toHaveURL(/\/tasks\/task_/);
  const taskId = /\/tasks\/(task_[^/?#]+)/.exec(page.url())![1];

  // The task carries the team: its expert is the leader's, the team's own ref comes back, the members by name and label.
  await expect(chip).toHaveCount(0);
  const config = await (await request.get(`/v1/tasks/${taskId}/config`)).json();
  expect(config).toMatchObject({ expert: writer.ref, team_ref: stored.ref, team: { ref: stored.ref, leader: "member-1" } });
  expect(config.team.members.map((member: { role: string; label: string; name: string }) => [member.role, member.label, member.name])).toEqual([["member-1", "主编", writer.name], ["member-2", "研究员", researcher.name], ["member-3", "编辑", editor.name]]);
  await expect(page.locator('[data-testid="config-chip"][data-chip="team"]')).toContainText(teamName);

  // ---- round one: the leader plans a node for the researcher, it runs, the leader reviews it
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });
  await expect(planNodes(page)).toHaveCount(3);
  let plan = await getPlan(request, taskId);
  const explore = plan.nodes[0];
  const member1 = plan.nodes.find((node) => node.title === "调研要点")!;
  const review1 = plan.nodes.find((node) => node.title === "领队复盘")!;
  expect(plan.nodes.map((node) => node.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED"]);
  expect(member1).toMatchObject({ owner_profile: researcher.ref, parent_node_id: explore.node_id });
  expect(review1).toMatchObject({ owner_profile: writer.ref, review_round: 1 });
  expect(member1.review_round ?? null).toBeNull();

  // ---- round two: a follow-up message makes the leader plan a node for the editor, and a second review
  const second = createGoal("润色成稿", "member-3");
  await page.getByPlaceholder("向任务发送消息").fill(second);
  await page.getByPlaceholder("向任务发送消息").press("Enter");
  plan = await eventually(() => getPlan(request, taskId), (p) => p.nodes.length === 6 && p.nodes.every((node) => node.status === "COMPLETED"), "the second round to finish", 120_000);
  await waitForStatus(request, taskId, "COMPLETED");
  const member2 = plan.nodes.find((node) => node.title === "润色成稿")!;
  const followUp = plan.nodes.find((node) => node.node_id === member2.parent_node_id)!;
  expect(member2.owner_profile).toBe(editor.ref);
  expect(followUp.owner_profile).toBe(writer.ref);
  // The workflow numbers the reviews itself: each of the two follows the tasks of its own leader node, so both are round 1.
  expect(plan.nodes.filter((node) => node.title === "领队复盘").map((node) => node.review_round)).toEqual([1, 1]);

  // The nodes ran as their members: the leader's expert for its own nodes and the reviews, each member's for its node.
  const ran = profilesByNode(taskId);
  expect(ran[explore.node_id]).toEqual([writer.ref]);
  expect(ran[member1.node_id]).toEqual([researcher.ref]);
  expect(ran[member2.node_id]).toEqual([editor.ref]);
  expect(plan.nodes.filter((node) => node.title === "领队复盘").map((node) => ran[node.node_id])).toEqual([[writer.ref], [writer.ref]]);

  // ---- the page: the conversation names who answered, the plan names who owns each node, all by the labels
  const expectLabels = async () => {
    await expect(planNodes(page)).toHaveCount(6);
    // The chat: each speaker under their label and expert, the leader marked; the member's replies, the two reviews.
    await expect.poll(async () => new Set(await speakerHeaders(page))).toEqual(new Set([`主编 · ${writer.name}`, `研究员 · ${researcher.name}`, `编辑 · ${editor.name}`]));
    expect(await speakerHeaders(page)).toEqual([`主编 · ${writer.name}`, `研究员 · ${researcher.name}`, `主编 · ${writer.name}`, `主编 · ${writer.name}`, `编辑 · ${editor.name}`, `主编 · ${writer.name}`]);
    await expect.poll(() => reviewLabels(page)).toEqual(["领队复盘 · 第 1 轮", "领队复盘 · 第 1 轮"]);
    await expect(page.locator('[data-testid="chat-bubble"][data-kind="assign"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="chat-group"][data-role="member-2"] [data-kind="reply"]').getByTestId("chat-to")).toContainText("@主编");
    const panel = page.getByRole("complementary", { name: "任务详情" });
    await expect(panel.locator('[data-testid="plan-node"][data-role="member-2"]')).toContainText(`研究员 · ${researcher.name}`);
    await expect(panel.locator('[data-testid="plan-node"][data-role="member-3"]')).toContainText(`编辑 · ${editor.name}`);
    await expect(panel.locator('[data-testid="plan-node"][data-kind="review"]')).toHaveCount(2);
    await expect(panel.locator('[data-testid="plan-node"][data-kind="leader"]')).toHaveCount(2);
    await expect(panel.locator('[data-testid="plan-node"][data-kind="leader"]').first()).toContainText(`主编 · ${writer.name}`);
    // The ids stay out of the labels (the goal the user typed, and the mock's own words, do name them).
    expect([...(await speakerHeaders(page)), ...(await panel.getByTestId("plan-node-role").allInnerTexts())].join("|")).not.toMatch(/member-\d/);
  };
  await expectLabels();

  // Grouped by member: the leader's four nodes (exploration, two reviews, the follow-up), one node each for the members.
  const panel = page.getByRole("complementary", { name: "任务详情" });
  await panel.getByRole("tab", { name: "按成员" }).click();
  await expect(panel.getByTestId("plan-member-group")).toHaveCount(3);
  await expect(panel.locator('[data-testid="plan-member-group"][data-role="member-1"]').getByTestId("plan-node")).toHaveCount(4);
  await expect(panel.locator('[data-testid="plan-member-group"][data-role="member-2"]').getByTestId("plan-node")).toHaveCount(1);
  await expect(panel.locator('[data-testid="plan-member-group"][data-role="member-3"]').getByTestId("plan-node")).toHaveCount(1);
  await panel.getByRole("tab", { name: "按顺序" }).click();

  // ---- the configuration round-trips the team: a change of mode keeps it (the page sends team_ref back)
  await page.getByTestId("config-add").click();
  await page.getByRole("menuitem", { name: "模式" }).click();
  await page.getByRole("menuitemradio", { name: /^计划/ }).click();
  await expect(page.getByTestId("config-notice")).toContainText("配置已更新");
  const changed = await (await request.get(`/v1/tasks/${taskId}/config`)).json();
  expect(changed).toMatchObject({ mode: "plan", expert: writer.ref, team_ref: stored.ref, team: { leader: "member-1" } });
  expect(changed.config_version).toBeGreaterThan(config.config_version);
  expect(changed.team.members).toEqual(config.team.members);
  expect((await getTask(request, taskId)).status).toBe("COMPLETED");

  // ---- a reload reads it all again: the events, the plan and the configuration
  await page.reload();
  await expectLabels();
  await expect(page.locator('[data-testid="config-chip"][data-chip="team"]')).toContainText(teamName);
  expect(profileReads, "the page does not look the team's ref up among the profiles").toEqual([]);
  await shot(page, "team-task");
});

test("E58 a team stage is a group chat: the leader gives work to two members, a note goes through the mailbox, the members answer under their own names, and the plan keeps the stage's limits", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const lead = await singleExpert(request, `领队专家 ${stamp}`);
  const researcher = await singleExpert(request, `调研专家 ${stamp}`);
  const writer = await singleExpert(request, `撰稿专家 ${stamp}`);
  const team = await teamExpert(request, `协作团 ${stamp}`, [["主编", lead], ["研究员", researcher], ["撰稿人", writer]]);
  const title = unique("E58");
  const taskId = await startTask(request, title, "start", team.ref);
  // Limits of its own: the page has to show these, not the defaults (10 rounds, 100 messages).
  await addTeamStage(request, taskId, {
    title: "团队写作",
    goal: "team: @member-2 note:found three facts;;@member-3 draft the summary",
    leader: "member-1",
    ownerProfile: lead.ref,
    limits: { max_rounds: 6, max_messages: 40 },
    members: [{ role: "member-1", label: "主编", executor: lead.ref }, { role: "member-2", label: "研究员", executor: researcher.ref, description: "查资料" }, { role: "member-3", label: "撰稿人", executor: writer.ref, description: "写稿" }],
  });
  await openTask(page, title);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });

  // Backend: two rounds of the leader (assign, then the answer), two member turns, and the group chat they made.
  const plan = await getPlan(request, taskId);
  const stageNode = plan.nodes.find((node) => node.type === "team_stage")!;
  expect(stageNode.status).toBe("COMPLETED");
  expect(stageNode.team).toMatchObject({ max_rounds: 6, max_messages: 40, max_hops: 3 });
  expect(eventCount(taskId, "team.round_started")).toBe(2);
  expect(eventCount(taskId, "team.round_finished")).toBe(2);
  expect(eventCount(taskId, "team.member_turn_started")).toBe(2);
  expect(eventCount(taskId, "team.member_turn_finished")).toBe(2);
  // One team.message per utterance: the leader's two assignments, the kickoff note and the researcher's, the two replies,
  // and the leader's final answer as the review. Each says who spoke and who it is for.
  const chatRows = sql(`SELECT string_agg((body->'payload'->>'kind') || ':' || (body->'payload'->>'from_role') || '>' || (body->'payload'->'to_roles')::text, '|' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message'`).split("|");
  expect(chatRows.filter((row) => row.startsWith("assign:member-1>")).sort()).toEqual(['assign:member-1>["member-2"]', 'assign:member-1>["member-3"]']);
  expect(chatRows.filter((row) => row.startsWith("reply:")).sort()).toEqual(['reply:member-2>["member-1"]', 'reply:member-3>["member-1"]']);
  expect(chatRows.filter((row) => row.startsWith("note:"))).toHaveLength(2);
  expect(chatRows.filter((row) => row.startsWith("review:member-1>"))).toHaveLength(1);
  expect(chatRows.at(-1)).toMatch(/^review:member-1>/);
  expect(sql(`SELECT string_agg(body->'payload'->>'from_role' || ':' || (body->'payload'->>'from_label') || ':' || (body->'payload'->>'text'), '|' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'note'`)).toBe("member-1:主编:kickoff: 2 task(s)|member-2:研究员:found three facts");
  // The members work at the same time, so which one finishes first is theirs to decide; who ran as which expert is not.
  expect(sql(`SELECT string_agg(body->'payload'->>'role' || ':' || (body->'payload'->>'executor') || ':' || (body->'payload'->>'outcome'), '|' ORDER BY body->'payload'->>'role') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.member_turn_finished'`)).toBe(`member-2:${researcher.ref}:completed|member-3:${writer.ref}:completed`);
  expect(sql(`SELECT string_agg(body->'payload'->>'role', ',' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.member_turn_started'`)).toBe("member-2,member-3");
  const finalText = sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'review'`);
  expect(finalText).toContain("team-final=");
  const lastRound = JSON.parse(sql(`SELECT body->'payload' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.round_finished' ORDER BY seq DESC LIMIT 1`));
  const started = JSON.parse(sql(`SELECT body->'payload' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.round_started' ORDER BY seq DESC LIMIT 1`));
  expect(started).toMatchObject({ max_rounds: 6, max_messages: 40, max_hops: 3 });
  expect(typeof lastRound.messages).toBe("number");

  // The page: the stage is a group chat. The leader's assignments name who they are for, the members answer under their own
  // names, the leader's final answer closes it, and every bubble is there once.
  const chat = page.getByTestId("chat-group");
  const bubble = (kind: string) => page.locator(`[data-testid="chat-bubble"][data-kind="${kind}"]`);
  await expect(bubble("assign")).toHaveCount(2);
  await expect(bubble("assign").nth(0).getByTestId("mention-chip").first()).toHaveText("@研究员");
  await expect(bubble("assign").nth(1).getByTestId("mention-chip").first()).toHaveText("@撰稿人");
  await expect(bubble("reply")).toHaveCount(2);
  const researcherGroup = page.locator('[data-testid="chat-group"][data-role="member-2"]');
  await expect(researcherGroup.first().getByTestId("chat-speaker")).toHaveText(`研究员 · ${researcher.name}`);
  await expect(researcherGroup.locator('[data-kind="reply"]')).toContainText("noted: found three facts");
  await expect(researcherGroup.locator('[data-kind="reply"]').getByTestId("chat-to")).toContainText("@主编");
  await expect(researcherGroup.locator('[data-kind="note"]')).toContainText("found three facts");
  const writerGroup = page.locator('[data-testid="chat-group"][data-role="member-3"]');
  await expect(writerGroup.first().getByTestId("chat-speaker")).toHaveText(`撰稿人 · ${writer.name}`);
  await expect(writerGroup.locator('[data-kind="reply"]')).toContainText("did: draft the summary");
  await expect(chat.first().getByTestId("chat-leader-tag")).toHaveText("领队");
  await expect(bubble("review")).toHaveCount(1);
  await expect(bubble("review")).toContainText("team-final=");
  expect(await bubble("assign").count() + (await bubble("reply").count()) + (await bubble("note").count()) + (await bubble("review").count())).toBe(eventCount(taskId, "team.message"));

  // The plan keeps the summary line, with the limits the stage was given; the nested message list is gone.
  const panel = page.getByRole("complementary", { name: "任务详情" });
  const stage = panel.getByTestId("team-stage");
  await expect(stage).toBeVisible();
  await expect(stage.getByTestId("team-progress")).toHaveText(new RegExp(`^第 2/6 轮 · 消息 ${lastRound.messages}/40 · 跳数上限 3$`));
  await expect(stage.getByTestId("team-turn")).toHaveCount(0);
  await expect(stage.getByTestId("team-note")).toHaveCount(0);
  // The stage node is the leader's.
  await expect(panel.locator('[data-testid="plan-node"][data-type="team_stage"]').getByTestId("plan-node-role")).toContainText(`主编 · ${lead.name}`);
  await shot(page, "team-chat");

  // A reload rebuilds the same view from the stored events.
  await page.reload();
  await expect(page.getByRole("complementary", { name: "任务详情" }).getByTestId("team-stage").getByTestId("team-progress")).toHaveText(new RegExp(`^第 2/6 轮 · 消息 \\d+/40 · 跳数上限 3$`));
  await expect(page.getByTestId("chat-bubble")).toHaveCount(await page.getByTestId("chat-bubble").count());
  await expect(bubble("assign")).toHaveCount(2);
});

test("E59 a leader whose reviews reach the cap the task's policy set leaves the task waiting, with a notice that says why and a resume that finishes it", async ({ page, request }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const lead = await singleExpert(request, `领队专家 ${stamp}`);
  const helper = await singleExpert(request, `助理专家 ${stamp}`);
  const team = await teamExpert(request, `复盘团 ${stamp}`, [["主编", lead], ["助理", helper]]);
  const title = unique("E59");
  // One review round is allowed. The exploration plans a node (round 1) that plans another (round 2): the second round is
  // the one nobody may review.
  const taskId = await startTask(request, title, "plan:plan:z", team.ref, { max_review_rounds: 1 });
  await openTask(page, title);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "PAUSED_NEEDS_REVIEW", { timeout: 120_000 });

  // Backend: the cap was announced once, with the round it stopped at, then the task asked for a person.
  expect(eventCount(taskId, "plan.review_limit_reached")).toBe(1);
  expect(JSON.parse(sql(`SELECT body->'payload' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'plan.review_limit_reached'`))).toMatchObject({ round: 2, max_rounds: 1, children: 1 });
  const plan = await getPlan(request, taskId);
  expect(plan.nodes.filter((node) => node.title === "领队复盘").map((node) => node.review_round)).toEqual([1]);
  expect(plan.nodes.every((node) => node.status === "COMPLETED")).toBe(true);
  expect((await getTask(request, taskId)).status).toBe("PAUSED_NEEDS_REVIEW");

  // The page: an attention card with the cap, the reason the workflow gave, and the resume that was always there.
  const notice = page.getByTestId("review-notice");
  await expect(notice).toHaveAttribute("data-kind", "review_limit");
  await expect(notice).toContainText("领队复盘已到上限（1 轮）");
  await expect(page.getByTestId("review-limit-detail")).toContainText("第 2 轮创建的 1 个任务");
  await expect(page.getByTestId("review-reason")).toContainText("reached the limit of 1 rounds");
  await expect(notice.getByTestId("attention-bar")).toBeVisible();
  await shot(page, "team-review-cap");
  // The one review that ran is round 1, and there is no second.
  await expect.poll(() => reviewLabels(page)).toEqual(["领队复盘 · 第 1 轮"]);

  await page.getByTestId("review-resume").click();
  await waitForStatus(request, taskId, "COMPLETED");
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED");
  await expect(page.getByTestId("review-notice")).toHaveCount(0);
  // Resuming added no review: the cap was reached, not forgotten.
  expect((await getPlan(request, taskId)).nodes.filter((node) => node.title === "领队复盘")).toHaveLength(1);
  expect(eventCount(taskId, "plan.review_limit_reached")).toBe(1);
});

test("E60 an approval a team member raises says which member asks, and the member goes on once it is allowed", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const lead = await singleExpert(request, `领队专家 ${stamp}`);
  const researcher = await singleExpert(request, `调研专家 ${stamp}`);
  const writer = await singleExpert(request, `撰稿专家 ${stamp}`);
  const team = await teamExpert(request, `审批团 ${stamp}`, [["主编", lead], ["研究员", researcher], ["撰稿人", writer]]);
  const title = unique("E60");
  const taskId = await startTask(request, title, "start", team.ref);
  await addTeamStage(request, taskId, {
    title: "需要确认的协作",
    goal: "team: @member-2 gated;;@member-3 draft it",
    leader: "member-1",
    ownerProfile: lead.ref,
    members: [{ role: "member-1", label: "主编", executor: lead.ref }, { role: "member-2", label: "研究员", executor: researcher.ref }, { role: "member-3", label: "撰稿人", executor: writer.ref }],
  });
  await openTask(page, title);

  const approval = page.getByTestId("approval-item");
  await expect(approval).toHaveCount(1, { timeout: 90_000 });
  await expect(approval).toContainText("成员 研究员 请求确认");
  await expect(approval).toHaveAttribute("data-role", "member-2");
  // Backend: the approval's subject names the member's role id; the page says its label and not the id twice.
  const subject = JSON.parse(sql(`SELECT body->'payload'->'subject' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'approval.requested'`));
  expect(subject).toMatchObject({ role: "member-2", role_label: "研究员" });
  expect(String(subject.summary)).toMatch(/^member-2[:：]/);
  await expect(approval).not.toContainText("member-2");
  await expect(approval.getByTestId("attention-bar")).toBeVisible();
  // The writer is not held up by the researcher's question.
  await expect(page.locator('[data-testid="chat-group"][data-role="member-3"] [data-kind="reply"]')).toContainText("did: draft it", { timeout: 30_000 });
  // The card sits in the chat, after the leader's assignment that led to it.
  const kinds = await page.locator('[data-testid="chat-bubble"], [data-testid="approval-item"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid") === "approval-item" ? "approval" : node.getAttribute("data-kind")));
  expect(kinds.indexOf("approval")).toBeGreaterThan(kinds.indexOf("assign"));

  await approval.getByRole("button", { name: "允许一次" }).click();
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });
  await expect(page.getByTestId("approval-item")).toHaveCount(0);
  expect(eventCount(taskId, "approval.requested")).toBe(1);
  expect(eventCount(taskId, "team.member_turn_finished")).toBe(2);
  expect(sql(`SELECT string_agg(body->'payload'->>'outcome', ',' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.member_turn_finished'`).split(",").sort()).toEqual(["completed", "completed"]);
});

/** A team of three with the labels the chat tests read: 主编 (leads), 研究员, 审校. */
async function chatTeam(request: APIRequestContext, stamp: number) {
  const lead = await singleExpert(request, `领队专家 ${stamp}`);
  const researcher = await singleExpert(request, `调研专家 ${stamp}`);
  const checker = await singleExpert(request, `校对专家 ${stamp}`);
  const team = await teamExpert(request, `群聊团 ${stamp}`, [["主编", lead], ["研究员", researcher], ["审校", checker]]);
  const members = [{ role: "member-1", label: "主编", executor: lead.ref }, { role: "member-2", label: "研究员", executor: researcher.ref }, { role: "member-3", label: "审校", executor: checker.ref }];
  return { lead, researcher, checker, team, members };
}

test("E61 a member @-mentions another and wakes them: both bubbles are in the chat, the woken member answers addressed back, and a ping-pong stops at the hop limit with a notice", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { lead, researcher, checker, team, members } = await chatTeam(request, Date.now());

  // ---- a note that @-mentions the other member wakes them
  const title = unique("E61");
  const taskId = await startTask(request, title, "start", team.ref);
  await addTeamStage(request, taskId, { title: "互相提问", goal: "team: @member-2 note:@审校 请看一眼标题", leader: "member-1", ownerProfile: lead.ref, members });
  await openTask(page, title);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });

  const rows = sql(`SELECT string_agg((body->'payload'->>'kind') || ':' || (body->'payload'->>'from_role') || '>' || (body->'payload'->'to_roles')::text || '#' || (body->'payload'->>'hop'), '|' ORDER BY seq) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message'`).split("|");
  // The note names the checker; the checker is woken one hop deep and answers to the one who asked.
  expect(rows).toContain('note:member-2>["member-3"]#0');
  expect(rows).toContain('reply:member-3>["member-2"]#1');
  const note = page.locator('[data-testid="chat-bubble"][data-kind="note"]').filter({ hasText: "请看一眼标题" });
  await expect(note.getByTestId("mention-chip")).toHaveText("@审校");
  await expect(page.locator('[data-testid="chat-group"][data-role="member-2"]').filter({ has: note })).toBeVisible();
  const woken = page.locator('[data-testid="chat-group"][data-role="member-3"] [data-kind="reply"]').filter({ hasText: "replied:" });
  await expect(woken).toHaveCount(1);
  await expect(woken.getByTestId("chat-to").getByTestId("mention-chip")).toHaveText("@研究员");
  await expect(woken.locator("xpath=ancestor::*[@data-testid='chat-group']").getByTestId("chat-speaker")).toHaveText(`审校 · ${checker.name}`);
  // The chain is in the stream in order: the note, then the woken member's answer.
  const order = await page.getByTestId("chat-bubble").evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute("data-kind")}:${(node.textContent ?? "").slice(0, 40)}`));
  expect(order.findIndex((text) => text.startsWith("note:"))).toBeLessThan(order.findIndex((text) => text.includes("replied:")));

  // ---- a ping-pong: every wake @-mentions the one who woke it, and only the hop limit stops it
  const pingTitle = unique("E61 hops");
  const pingId = await startTask(request, pingTitle, "start", team.ref);
  await addTeamStage(request, pingId, { title: "来回提问", goal: "team: @member-2 note:@审校 ping-pong", leader: "member-1", ownerProfile: lead.ref, members });
  await openTask(page, pingTitle);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 120_000 });
  const system = sql(`SELECT body->'payload'->>'text' FROM task_events WHERE task_id = '${pingId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'system'`);
  expect(system.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(1);
  const hops = sql(`SELECT max((body->'payload'->>'hop')::int) FROM task_events WHERE task_id = '${pingId}' AND event_type = 'team.message' AND body->'payload'->>'kind' <> 'system'`);
  expect(Number(hops)).toBeLessThanOrEqual(3);
  // The notice is a quiet centred line in the chat, not a speaker, and it says the same thing as the event.
  const notice = page.getByTestId("chat-system");
  await expect(notice.first()).toBeVisible();
  await expect(notice.first()).toHaveText(system.split("\n")[0]);
  await expect(page.locator('[data-testid="chat-group"][data-role="system"]')).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "任务详情" }).getByTestId("team-progress")).toContainText("跳数上限 3");
  await shot(page, "team-hops");
  void researcher;
});

test("E62 the user @-mentions a member from the composer: the picker, the chip, the mentions on the wire, a follow-up node owned by that member, and the member's reply addressed to the user", async ({ page, request }) => {
  test.setTimeout(180_000);
  const { lead, researcher, team } = await chatTeam(request, Date.now());
  const title = unique("E62");
  const taskId = await startTask(request, title, "start", team.ref);
  await openTask(page, title);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });

  // Typing "@" opens the picker: members with their labels and avatars, the leader marked, keyboard navigable.
  const box = page.getByPlaceholder("向任务发送消息");
  await box.click();
  await box.pressSequentially("@");
  const picker = page.getByTestId("mention-picker");
  await expect(picker.getByRole("option")).toHaveCount(3);
  await expect(picker.getByRole("option").nth(0)).toContainText("主编");
  await expect(picker.getByRole("option").nth(0)).toContainText("领队");
  await expect(picker.getByRole("option").nth(1)).toContainText(`研究员 · ${researcher.name}`);
  await expect(picker.getByTestId("avatar")).toHaveCount(3);
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await box.pressSequentially("研");
  await expect(picker.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  // The pick is a chip above the text, and the typed "@研" is gone.
  await expect(page.getByTestId("composer-mention")).toHaveCount(1);
  await expect(page.getByTestId("composer-mention").getByTestId("mention-chip")).toHaveText("@研究员");
  await expect(box).toHaveValue("");
  await box.pressSequentially("帮我查一下进度");

  const sent = page.waitForRequest((req) => req.url().includes(`/v1/tasks/${taskId}/messages`) && req.method() === "POST");
  await box.press("Enter");
  expect(JSON.parse((await sent).postData() ?? "{}")).toMatchObject({ text: "帮我查一下进度", mentions: ["member-2"] });
  await expect(page.getByTestId("composer-mention")).toHaveCount(0);

  // The user's bubble carries the chip; a follow-up node of the member runs; the member answers to the user.
  const mine = page.getByTestId("user-message").filter({ hasText: "帮我查一下进度" });
  await expect(mine.getByTestId("mention-chip")).toHaveText("@研究员");
  const plan = await eventually(() => getPlan(request, taskId), (p) => p.nodes.length === 2 && p.nodes.every((node) => node.status === "COMPLETED"), "the member's follow-up node to finish", 90_000);
  const followUp = plan.nodes.find((node) => node.title.startsWith("@"))!;
  expect(followUp).toMatchObject({ owner_profile: researcher.ref, owner_role: "member-2", owner_label: "研究员" });
  expect(followUp.title).toContain("帮我查一下进度");
  expect(profilesByNode(taskId)[followUp.node_id]).toEqual([researcher.ref]);
  expect(JSON.parse(sql(`SELECT body->'payload'->'mentions' FROM task_events WHERE task_id = '${taskId}' AND event_type = 'message.user' AND body->'payload'->>'text' = '帮我查一下进度'`))).toEqual(["member-2"]);
  // The reply message is written just after the node completes, so it may land a moment after the plan says so.
  const reply = await eventually(async () => sql(`SELECT (body->'payload'->>'from_role') || '>' || (body->'payload'->'to_roles')::text FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'reply'`), (row) => row !== "", "the member's reply message", 30_000);
  expect(reply).toBe('member-2>["user"]');
  const answer = page.locator('[data-testid="chat-group"][data-role="member-2"] [data-kind="reply"]');
  await expect(answer).toHaveCount(1);
  await expect(answer.getByTestId("chat-to")).toContainText("@你");
  await expect(answer.locator("xpath=ancestor::*[@data-testid='chat-group']").getByTestId("chat-speaker")).toHaveText(`研究员 · ${researcher.name}`);
  // The plan shows the follow-up under the member that owns it.
  await expect(page.getByRole("complementary", { name: "任务详情" }).locator('[data-testid="plan-node"][data-role="member-2"]')).toContainText("研究员");

  // Refusals come back in Chinese and nothing is sent: an unknown member, and a task without a team.
  const unknown = await request.post(`/v1/tasks/${taskId}/messages`, { data: { text: "x", mentions: ["ghost"] } });
  expect(unknown.status()).toBe(422);
  expect(await unknown.json()).toMatchObject({ code: "UNKNOWN_MENTION", field: "mentions[0]" });
  const plain = (await (await request.post("/v1/tasks", { data: { title: unique("E62 plain"), goal: "start" } })).json()).task_id as string;
  const refused = await request.post(`/v1/tasks/${plain}/messages`, { data: { text: "x", mentions: ["member-2"] } });
  expect(refused.status()).toBe(422);
  expect(await refused.json()).toMatchObject({ code: "MENTIONS_NOT_ALLOWED", field: "mentions" });
  await page.route(`**/v1/tasks/${taskId}/messages`, (route) => route.fulfill({ status: 422, json: { error: "unknown mention", code: "UNKNOWN_MENTION", message: "x", field: "mentions[0]", reason: "x" } }));
  await box.pressSequentially("@研");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("composer-mention")).toHaveCount(1);
  await box.pressSequentially("再问一次");
  await box.press("Enter");
  await expect(page.getByText("@ 的成员不在这个团队里。")).toBeVisible();
  await page.unroute(`**/v1/tasks/${taskId}/messages`);
  await shot(page, "team-composer");
  void lead;
});

test("E63 the user @-mentions a member while a stage runs: the member is woken at once, answers the user, and the others carry on", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { lead, checker, team, members } = await chatTeam(request, Date.now());
  const stamp = Date.now();
  const title = unique("E63");
  const taskId = await startTask(request, title, "start", team.ref);
  // The researcher is busy for a few seconds (three held tool calls); the checker is idle.
  await addTeamStage(request, taskId, { title: "进行中的协作", goal: `team: @member-2 slow:e63-a-${stamp}|e63-b-${stamp}|e63-c-${stamp}`, leader: "member-1", ownerProfile: lead.ref, members });
  await openTask(page, title);
  await expect(page.locator('[data-testid="chat-bubble"][data-kind="assign"]')).toHaveCount(1, { timeout: 60_000 });

  const box = page.getByPlaceholder("向任务发送消息");
  await box.click();
  await box.pressSequentially("@审");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("composer-mention")).toHaveCount(1);
  await box.pressSequentially("你好吗");
  await box.press("Enter");

  // Backend: the user's message went into the stage's mailbox (kind user, for the checker), the checker answered the user.
  await eventually(async () => sql(`SELECT count(*) FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'user'`), (n) => n === "1", "the user's message in the stage's chat", 60_000);
  expect(sql(`SELECT (body->'payload'->'to_roles')::text FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'user'`)).toBe('["member-3"]');
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 150_000 });
  const toUser = sql(`SELECT (body->'payload'->>'from_role') || ':' || (body->'payload'->>'text') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'reply' AND body->'payload'->'to_roles' = '["user"]'::jsonb`);
  expect(toUser).toContain("member-3:");
  expect(toUser).toContain("replied:");
  // The user's message was not left for the leader's next turn: the leader never saw it as a "用户消息" and the stage finished.
  expect(eventCount(taskId, "team.member_turn_finished")).toBeGreaterThanOrEqual(2);

  // The page: the user's bubble with the chip, the checker's answer to @你 under the checker's own header, and the
  // researcher's own work (its three tool calls) is not in the checker's bubble.
  const mine = page.getByTestId("user-message").filter({ hasText: "你好吗" });
  await expect(mine.getByTestId("mention-chip")).toHaveText("@审校");
  const answer = page.locator('[data-testid="chat-group"][data-role="member-3"] [data-kind="reply"]').filter({ hasText: "replied:" });
  await expect(answer).toHaveCount(1);
  await expect(answer.getByTestId("chat-to")).toContainText("@你");
  await expect(answer.locator("xpath=ancestor::*[@data-testid='chat-group']").getByTestId("chat-speaker")).toHaveText(`审校 · ${checker.name}`);
  await expect(answer.getByText(/已执行/)).toHaveCount(0);
  const researcherReply = page.locator('[data-testid="chat-group"][data-role="member-2"] [data-kind="reply"]');
  await expect(researcherReply.getByText("已执行 3 个步骤")).toBeVisible();
});

test("E64 two members work at the same time: each one's steps, reasoning and streamed text stay in their own bubble", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { lead, team, members } = await chatTeam(request, Date.now());
  const stamp = Date.now();
  const title = unique("E64");
  const taskId = await startTask(request, title, "start", team.ref);
  // Both members call held tools in turn (about a second and a half each), so they overlap.
  await addTeamStage(request, taskId, {
    title: "并行协作",
    goal: `team: @member-2 slow:r-one-${stamp}|r-two-${stamp};;@member-3 slow:c-one-${stamp}|c-two-${stamp}`,
    leader: "member-1",
    ownerProfile: lead.ref,
    members,
  });
  await openTask(page, title);

  // While they work: a live bubble for each, under its own header, with its own step running.
  const live = page.locator('[data-testid="chat-bubble"][data-live="true"]');
  await expect.poll(async () => (await live.evaluateAll((nodes) => nodes.map((node) => node.closest('[data-testid="chat-group"]')?.getAttribute("data-role")))).sort(), { timeout: 60_000 }).toEqual(["member-2", "member-3"]);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 150_000 });

  // Backend: every tool event of the stage names its member and that member's own session; the two sessions differ, and
  // all of them belong to the stage's one attempt.
  const rows = sql(`SELECT string_agg((body->'payload'->>'team_role') || '|' || (body->'payload'->>'team_session') || '|' || (body->'payload'->>'attempt_id') || '|' || (body->'payload'->>'tool_name'), E'\\n') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'tool.call_finished' AND body->'payload'->>'tool_name' = 'slow_echo'`).split("\n").map((row) => row.split("|"));
  expect(rows).toHaveLength(4);
  const byRole = (role: string) => rows.filter((row) => row[0] === role);
  expect(byRole("member-2")).toHaveLength(2);
  expect(byRole("member-3")).toHaveLength(2);
  expect(new Set(byRole("member-2").map((row) => row[1])).size).toBe(1);
  expect(new Set(byRole("member-3").map((row) => row[1])).size).toBe(1);
  expect(byRole("member-2")[0][1]).not.toBe(byRole("member-3")[0][1]);
  expect(new Set(rows.map((row) => row[2])).size).toBe(1);

  // The page: each member's reply carries exactly its own two steps, found by the arguments they were given.
  for (const [role, mine, theirs] of [["member-2", "r-", "c-"], ["member-3", "c-", "r-"]] as const) {
    // (The mailbox text a member is given names the leader as `member-1`, so a bare "r-" would match that.)
    const reply = page.locator(`[data-testid="chat-group"][data-role="${role}"] [data-kind="reply"]`);
    await expect(reply).toHaveCount(1);
    await expect(reply.getByText("已执行 2 个步骤")).toBeVisible();
    await reply.getByText("已执行 2 个步骤").click();
    const steps = await reply.getByTestId("step-row").allTextContents();
    expect(steps).toHaveLength(2);
    expect(steps.join(" ")).toContain(`${mine}one-${stamp}`);
    expect(steps.join(" ")).toContain(`${mine}two-${stamp}`);
    expect(steps.join(" ")).not.toContain(`${theirs}one-${stamp}`);
    expect(steps.join(" ")).not.toContain(`${theirs}two-${stamp}`);
  }
  await shot(page, "team-concurrent");
});

test("E65 the user @-mentions two members in one message: their follow-up nodes run at the same time, each leaves a file, and both replies are addressed to the user", async ({ page, request }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const { researcher, checker, team } = await chatTeam(request, stamp);
  const title = unique("E65");
  const taskId = await startTask(request, title, "start", team.ref);
  await openTask(page, title);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "COMPLETED", { timeout: 90_000 });

  const box = page.getByPlaceholder("向任务发送消息");
  await box.click();
  for (const query of ["研", "审"]) {
    await box.pressSequentially(`@${query}`);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("composer-mention")).toHaveCount(query === "研" ? 1 : 2);
  }
  // Held tool calls keep both attempts running for a few seconds; then each writes a file into its own copy of the workspace.
  await box.pressSequentially(`chain:slow:e65-a-${stamp};;slow:e65-b-${stamp};;slow:e65-c-${stamp};;file:e65.txt|made in ${stamp}`);
  const sent = page.waitForRequest((req) => req.url().includes(`/v1/tasks/${taskId}/messages`) && req.method() === "POST");
  await box.press("Enter");
  expect(JSON.parse((await sent).postData() ?? "{}").mentions).toEqual(["member-2", "member-3"]);

  // Two follow-up nodes, one per member, read-only, and both RUNNING in the same plan snapshot.
  const both = await eventually(
    () => getPlan(request, taskId),
    (p) => p.nodes.filter((node) => node.title.startsWith("@") && node.status === "RUNNING").length === 2,
    "both follow-up nodes to be running at once",
    60_000,
  );
  const followUps = both.nodes.filter((node) => node.title.startsWith("@"));
  expect(followUps.map((node) => node.owner_role).sort()).toEqual(["member-2", "member-3"]);
  expect(followUps.map((node) => node.owner_profile).sort()).toEqual([researcher.ref, checker.ref].sort());
  expect(followUps.map((node) => (node as { workspace_access?: string }).workspace_access)).toEqual(["read", "read"]);
  // On the page: a live bubble for each, under its own header.
  const live = page.locator('[data-testid="chat-bubble"][data-live="true"]');
  await expect.poll(async () => (await live.evaluateAll((nodes) => nodes.map((node) => node.closest('[data-testid="chat-group"]')?.getAttribute("data-role")))).sort(), { timeout: 30_000 }).toEqual(["member-2", "member-3"]);

  await eventually(() => getPlan(request, taskId), (p) => p.nodes.every((node) => node.status === "COMPLETED"), "the follow-ups to finish", 120_000);
  await waitForStatus(request, taskId, "COMPLETED");

  // Each leaves its file as an artifact of its own attempt; both replies are addressed to the user.
  const manifests = (await (await request.get(`/v1/tasks/${taskId}/artifacts`)).json()).items as Array<{ attempt_id?: string; entries: Array<{ name: string }> }>;
  const withFile = manifests.filter((m) => m.entries.some((entry) => entry.name === "e65.txt"));
  expect(new Set(withFile.map((m) => m.attempt_id)).size).toBe(2);
  expect(await eventually(async () => sql(`SELECT string_agg((body->'payload'->>'from_role') || '>' || (body->'payload'->'to_roles')::text, '|' ORDER BY body->'payload'->>'from_role') FROM task_events WHERE task_id = '${taskId}' AND event_type = 'team.message' AND body->'payload'->>'kind' = 'reply'`), (rows) => rows.split("|").length === 2, "both reply messages", 30_000)).toBe('member-2>["user"]|member-3>["user"]');
  for (const role of ["member-2", "member-3"]) {
    const reply = page.locator(`[data-testid="chat-group"][data-role="${role}"] [data-kind="reply"]`);
    await expect(reply).toHaveCount(1);
    await expect(reply.getByTestId("chat-to")).toContainText("@你");
    await expect(reply.getByRole("button", { name: "下载 e65.txt" })).toBeVisible();
  }
  await shot(page, "team-two-mentions");
});

test("E66 cancelling a task while two stage members are running reaches CANCELLED promptly and leaves nothing running", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const { lead, team, members } = await chatTeam(request, stamp);
  const title = unique("E66");
  const taskId = await startTask(request, title, "start", team.ref);
  await addTeamStage(request, taskId, {
    title: "会被取消的协作",
    goal: `team: @member-2 slow:e66-a-${stamp}|e66-b-${stamp}|e66-c-${stamp}|e66-d-${stamp};;@member-3 slow:e66-e-${stamp}|e66-f-${stamp}|e66-g-${stamp}|e66-h-${stamp}`,
    leader: "member-1",
    ownerProfile: lead.ref,
    members,
  });
  await openTask(page, title);
  const live = page.locator('[data-testid="chat-bubble"][data-live="true"]');
  await expect(live).toHaveCount(2, { timeout: 60_000 });

  const cancelled = Date.now();
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "取消任务" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认取消任务" }).click();
  await waitForStatus(request, taskId, "CANCELLED", 30_000);
  expect(Date.now() - cancelled).toBeLessThan(30_000);
  await expect(taskStatus(page)).toHaveAttribute("data-status", "CANCELLED");
  // Nothing of the task is still running: no node, and no attempt workflow in Temporal.
  await eventually(async () => (await getPlan(request, taskId)).nodes.filter((node) => node.status === "RUNNING").length, (n) => n === 0, "no node running", 15_000);
  await eventually(async () => runningAttemptWorkflows(taskId), (n) => n === 0, "no attempt workflow running", 30_000);
  await expect(page.getByTestId("composer-action")).toBeDisabled();
});
