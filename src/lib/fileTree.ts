export interface TreeEntry {
  readonly path: string;
  readonly size?: number;
}

export interface FolderNode<T extends TreeEntry = TreeEntry> {
  readonly kind: "dir";
  /** 显示名；只有一个子文件夹的链会合并成 `a/b/c`。 */
  readonly name: string;
  /** 最深一层文件夹的完整路径，当作展开状态的键。 */
  readonly path: string;
  /** 这个文件夹下（含子文件夹）的文件数。 */
  readonly count: number;
  readonly children: readonly TreeNode<T>[];
}
export interface FileNode<T extends TreeEntry = TreeEntry> {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly size: number;
  readonly entry: T;
}
export type TreeNode<T extends TreeEntry = TreeEntry> = FolderNode<T> | FileNode<T>;

/** 文件少到一眼能看完时整棵树全部展开。 */
export const EXPAND_ALL_MAX = 20;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "zh-Hans", { numeric: true });

interface Draft<T extends TreeEntry> {
  readonly dirs: Map<string, Draft<T>>;
  readonly files: { name: string; path: string; entry: T }[];
}
const draft = <T extends TreeEntry>(): Draft<T> => ({ dirs: new Map(), files: [] });

function countFiles<T extends TreeEntry>(node: Draft<T>): number {
  let total = node.files.length;
  for (const child of node.dirs.values()) total += countFiles(child);
  return total;
}

function finish<T extends TreeEntry>(node: Draft<T>, prefix: string): TreeNode<T>[] {
  const folders: FolderNode<T>[] = [...node.dirs].map(([segment, child]) => {
    // 像 VS Code 一样：文件夹里没有文件、只有一个子文件夹时，把名字并起来。
    let label = segment;
    let path = prefix ? `${prefix}/${segment}` : segment;
    let current = child;
    while (current.files.length === 0 && current.dirs.size === 1) {
      const [[next, nextDraft]] = [...current.dirs];
      label = `${label}/${next}`;
      path = `${path}/${next}`;
      current = nextDraft;
    }
    return { kind: "dir", name: label, path, count: countFiles(current), children: finish(current, path) };
  });
  const files: FileNode<T>[] = node.files.map(({ name, path, entry }) => ({ kind: "file", name, path, size: entry.size ?? 0, entry }));
  return [...folders.sort(byName), ...files.sort(byName)];
}

/** 把一排带路径的文件组织成文件夹树：文件夹在前、文件在后，各按名称排序，单链文件夹合并。 */
export function buildFileTree<T extends TreeEntry>(entries: readonly T[]): readonly TreeNode<T>[] {
  const root = draft<T>();
  for (const entry of entries) {
    const parts = entry.path.split(/[\\/]/).filter(Boolean);
    const name = parts.pop();
    if (!name) continue;
    let level = root;
    for (const part of parts) {
      let next = level.dirs.get(part);
      if (!next) {
        next = draft<T>();
        level.dirs.set(part, next);
      }
      level = next;
    }
    level.files.push({ name, path: [...parts, name].join("/"), entry });
  }
  return finish(root, "");
}

/** 一开始展开哪些文件夹：文件不多就全开，否则只开最外一层；`reveal` 指定的文件所在的各层也展开。 */
export function initialExpanded(tree: readonly TreeNode[], fileCount: number, reveal?: string | null): ReadonlySet<string> {
  const open = new Set<string>();
  const visit = (nodes: readonly TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (node.kind !== "dir") continue;
      if (fileCount <= EXPAND_ALL_MAX || depth === 0 || (reveal && reveal.startsWith(`${node.path}/`))) open.add(node.path);
      visit(node.children, depth + 1);
    }
  };
  visit(tree, 0);
  return open;
}
