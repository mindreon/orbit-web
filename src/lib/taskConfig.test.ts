import { describe, expect, it } from "vitest";
import { draftToInput, emptyDraft, isDefaultDraft, sameDraft, viewToDraft, type TaskConfigView } from "./taskConfig";

/**
 * Ways the task configuration can lose a team, each asserted below:
 *   C1 reading a task's configuration and writing it back (a mode change) sends the leader's expert, and the team is dropped
 *   C2 a task with a team reads back as a task with a single expert, or the other way round
 *   C3 picking a single expert after a team keeps the team on screen, or sends a team_ref with it
 */
const team = { ref: "team_1@2", leader: "lead", members: [{ role: "lead", expert: "lead_e@1", name: "撰稿专家", label: "主编" }, { role: "member-2", expert: "res_e@2", name: "调研专家", label: "研究员" }] };
const view = (extra: Partial<TaskConfigView> = {}): TaskConfigView => ({ config_version: 3, expert: "lead_e@1", skills: null, connector_ids: null, mode: "default", ...extra });

describe("the configuration of a task with a team", () => {
  it("writes the team's own ref back as team_ref, not the leader's expert (C1)", () => {
    const draft = viewToDraft(view({ team, team_ref: "team_1@2" }));
    expect(draft).toMatchObject({ expert: "team_1@2", team });
    expect(draftToInput({ ...draft, mode: "ask" })).toEqual({ team_ref: "team_1@2", model: "", skills: null, connector_ids: null, mode: "ask", permissions: { preset: "default" } });
  });

  it("reads the ref from the team when the view has no team_ref of its own (C1)", () => {
    expect(viewToDraft(view({ team })).expert).toBe("team_1@2");
  });

  it("falls back to the leader's expert only when the ref is nowhere, and still shows the team (C1, C2)", () => {
    const draft = viewToDraft(view({ team: { ...team, ref: undefined } }));
    expect(draft.expert).toBe("lead_e@1");
    expect(draft.team?.leader).toBe("lead");
  });

  it("reads a single expert without a team, and writes it as expert (C2)", () => {
    const draft = viewToDraft(view());
    expect(draft).toMatchObject({ expert: "lead_e@1", team: null });
    expect(draftToInput(draft)).toEqual({ expert: "lead_e@1", model: "", skills: null, connector_ids: null, mode: "default", permissions: { preset: "default" } });
    expect(viewToDraft(view({ team: null })).team).toBeNull();
  });

  it("sends a single expert chosen after a team as expert, with no team_ref (C3)", () => {
    const picked = { ...viewToDraft(view({ team, team_ref: "team_1@2" })), expert: "solo@1", team: null, teamName: "" };
    expect(draftToInput(picked)).toEqual({ expert: "solo@1", model: "", skills: null, connector_ids: null, mode: "default", permissions: { preset: "default" } });
  });

  it("is not the default draft, and differs from one with another expert (C3)", () => {
    const draft = viewToDraft(view({ team, team_ref: "team_1@2" }));
    expect(isDefaultDraft(draft)).toBe(false);
    expect(sameDraft(draft, { ...draft, expert: "x@1", team: null })).toBe(false);
    expect(sameDraft(draft, { ...draft, teamName: "other" })).toBe(true);
    expect(isDefaultDraft({ ...emptyDraft })).toBe(true);
  });
});
