import { expect, it } from "vitest";
import { schemaEnum } from "../../test/schemaEnum";
import { visibilityLabels } from "../../components/kindLabels";
import { assetNameValid, timelineSteps, versionTransitions } from "./model";
import { versionStateLabels } from "./labels";
it.each(["abc", "a-b", "0ab", "a".repeat(64)])("accepts asset name %s", (name) => expect(assetNameValid(name)).toBe(true));
it.each(["ab", "Abc", "a_b", "a/b", " abc", "a".repeat(65)])("rejects invalid asset name %s", (name) => expect(assetNameValid(name)).toBe(false));
it("covers every version state and uses visibility labels without infrastructure terminology", () => {
  expect(Object.keys(versionStateLabels).sort()).toEqual(schemaEnum("AssetVersion", "state"));
  expect(visibilityLabels).toEqual({ private: "私有", workspace: "工作空间", tenant: "全员可见" });
});
it.each(schemaEnum("AssetVersion", "state"))("timeline has exactly one current or failed state for %s", (state) => {
  const steps = timelineSteps(state as keyof typeof versionStateLabels);
  expect(steps.filter((step) => step.tone === "current" || step.tone === "failed").map((step) => step.state)).toEqual([state]);
});
it("does not imply review approval for check failure or rejected versions", () => {
  expect(timelineSteps("check_failed").map((step) => step.state)).toEqual(["draft", "submitted", "checking", "check_failed"]);
  expect(timelineSteps("rejected").map((step) => step.state)).not.toContain("approved");
  expect(versionTransitions("published", false)).toEqual(["deprecated", "suspended"]);
  expect(versionTransitions("suspended", false)).toEqual(["yanked"]);
  expect(versionTransitions("suspended", true)).toEqual(["published", "yanked"]);
  expect(versionTransitions("deprecated", true)).toEqual(["yanked"]);
  expect(versionTransitions("checking", true)).toEqual([]);
});
