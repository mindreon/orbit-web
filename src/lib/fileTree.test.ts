import { describe, expect, it } from "vitest";
import { buildFileTree, initialExpanded, type FolderNode, type TreeNode } from "./fileTree";

const file = (path: string) => ({ path, size: 1 });
const names = (nodes: readonly TreeNode[]) => nodes.map((node) => node.name);

describe("buildFileTree", () => {
  it("puts folders before files and sorts each by name", () => {
    const tree = buildFileTree([file("z.md"), file("b/x.md"), file("a.md"), file("a/y.md"), file("a/b/z.md")]);
    expect(names(tree)).toEqual(["a", "b", "a.md", "z.md"]);
    const a = tree[0] as FolderNode;
    expect(names(a.children)).toEqual(["b", "y.md"]);
  });

  it("sorts numbers naturally", () => {
    expect(names(buildFileTree([file("p10.md"), file("p2.md")]))).toEqual(["p2.md", "p10.md"]);
  });

  it("compacts single-child folder chains but not folders that hold files", () => {
    const tree = buildFileTree([file("site/src/components/Hero.tsx"), file("site/src/components/Nav.tsx"), file("site/src/main.tsx")]);
    expect(names(tree)).toEqual(["site/src"]);
    const src = tree[0] as FolderNode;
    expect(src.path).toBe("site/src");
    expect(names(src.children)).toEqual(["components", "main.tsx"]);
    const lone = buildFileTree([file("a/b/c/d.md")]);
    expect(names(lone)).toEqual(["a/b/c"]);
  });

  it("counts files in every descendant", () => {
    const tree = buildFileTree([file("a/b/1.md"), file("a/b/2.md"), file("a/3.md"), file("4.md")]);
    const a = tree[0] as FolderNode;
    expect(a.count).toBe(3);
    expect((a.children[0] as FolderNode).count).toBe(2);
  });

  it("carries size and the original entry on files", () => {
    const [node] = buildFileTree([{ path: "a.md", size: 7, tag: "x" }]);
    expect(node).toMatchObject({ kind: "file", path: "a.md", size: 7, entry: { tag: "x" } });
  });

  it("keeps a folder and a file with the same name apart", () => {
    expect(names(buildFileTree([file("x/y.md"), file("x")]))).toEqual(["x", "x"]);
  });
});

describe("initialExpanded", () => {
  const many = Array.from({ length: 25 }, (_, i) => file(`top/mid/deep/f${i}.md`)).concat([file("top/mid/other/g.md"), file("top/h.md")]);
  it("expands everything for small trees", () => {
    const files = [file("a/b/c.md"), file("a/b/d/e.md")];
    const open = initialExpanded(buildFileTree(files), files.length);
    expect([...open].sort()).toEqual(["a/b", "a/b/d"]);
  });
  it("also opens the folders above a revealed file in big trees", () => {
    const open = initialExpanded(buildFileTree(many), many.length, "top/mid/other/g.md");
    expect([...open].sort()).toEqual(["top", "top/mid", "top/mid/other"]);
  });
  it("expands only top-level folders for big trees", () => {
    const open = initialExpanded(buildFileTree(many), many.length);
    expect([...open]).toEqual(["top"]);
  });
});
