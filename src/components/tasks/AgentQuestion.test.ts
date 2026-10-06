import { describe, expect, it } from "vitest";
import { formatAnswers } from "./AgentQuestion";

const questions = [
  { header: "公司", question: "公司名称？", options: [{ label: "迈能" }, { label: "其他" }], multiSelect: false },
  { header: "页面", question: "要哪些页面？", options: [{ label: "首页" }, { label: "关于我们" }], multiSelect: true },
  { header: "风格", question: "风格？", options: [{ label: "简约" }, { label: "商务" }], multiSelect: false },
] as const;

describe("formatAnswers", () => {
  it("sends one line per question with the chosen labels and the user's own text", () => {
    expect(formatAnswers(questions, [{ picked: [0], custom: "" }, { picked: [0, 1], custom: "联系方式" }, { picked: [], custom: "" }])).toBe(
      "1. 公司：迈能\n2. 页面：首页、关于我们、联系方式\n3. 风格：未回答",
    );
  });
});
