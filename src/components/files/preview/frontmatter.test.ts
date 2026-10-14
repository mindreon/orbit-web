import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./frontmatter";

describe("stripFrontmatter", () => {
  it("returns text without frontmatter as it is, trimmed", () => {
    expect(stripFrontmatter("  # 标题\n正文  ")).toBe("# 标题\n正文");
  });

  it("drops a leading YAML header and returns what follows", () => {
    expect(stripFrontmatter("---\nname: writer\ndescription: 写作\n---\n\n# 指令\n内容")).toBe("# 指令\n内容");
  });

  it("copes with a header whose line breaks were collapsed", () => {
    expect(stripFrontmatter("--- name: writer description: 写作 --- # 指令")).toBe("# 指令");
  });

  it("falls back to the description when nothing follows the header", () => {
    expect(stripFrontmatter("---\nname: writer\ndescription: 写作助手\n---")).toBe("写作助手");
    expect(stripFrontmatter("---\nname: writer\ndescription: 写作助手\nlicense: MIT\n---")).toBe("写作助手");
  });

  it("returns an empty string for a header with nothing to show", () => {
    expect(stripFrontmatter("---\nname: writer\n---")).toBe("");
  });
});
