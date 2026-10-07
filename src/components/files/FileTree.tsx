import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, File as FileGlyph, Folder, FolderOpen } from "lucide-react";
import { buildFileTree, initialExpanded, type FileNode, type TreeEntry, type TreeNode } from "../../lib/fileTree";
import { formatSize } from "../../lib/time";

interface LevelProps<T extends TreeEntry> {
  readonly nodes: readonly TreeNode<T>[];
  readonly depth: number;
  readonly label: string;
  readonly open: ReadonlySet<string>;
  readonly selected?: string | null;
  readonly onToggle: (path: string) => void;
  readonly onOpen: (entry: T) => void;
  readonly renderIcon?: (entry: T) => ReactNode;
  readonly renderMeta?: (entry: T) => ReactNode;
}

const ROW = "flex w-full items-center gap-2 rounded-control py-1.5 pr-2 text-left text-body hover:bg-secondary";

function Level<T extends TreeEntry>({ nodes, depth, label, open, selected, onToggle, onOpen, renderIcon, renderMeta }: LevelProps<T>) {
  return (
    <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? label : undefined} className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        const indent = { paddingLeft: 8 + 14 * depth };
        if (node.kind === "file") {
          const file: FileNode<T> = node;
          const active = selected === file.path;
          return (
            <li key={`file:${file.path}`} role="none">
              <button type="button" role="treeitem" aria-selected={active} title={file.path} style={indent} className={`${ROW} ${active ? "bg-secondary" : ""}`} onClick={() => onOpen(file.entry)}>
                <span aria-hidden="true" className="w-3.5 shrink-0" />
                {renderIcon ? renderIcon(file.entry) : <FileGlyph aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
                {renderMeta ? renderMeta(file.entry) : file.entry.size !== undefined ? <span className="shrink-0 text-caption text-muted-foreground">{formatSize(file.size)}</span> : null}
              </button>
            </li>
          );
        }
        const expanded = open.has(node.path);
        return (
          <li key={`dir:${node.path}`} role="none">
            <button type="button" role="treeitem" aria-expanded={expanded} title={node.path} style={indent} className={ROW} onClick={() => onToggle(node.path)}>
              <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
              {expanded ? <FolderOpen aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" /> : <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-700" />}
              <span className="min-w-0 flex-1 truncate text-foreground">{node.name}</span>
              <span aria-label={`${node.count} 个文件`} className="shrink-0 text-caption text-muted-foreground">
                {node.count}
              </span>
            </button>
            {expanded ? <Level nodes={node.children} depth={depth + 1} label={label} open={open} selected={selected} onToggle={onToggle} onOpen={onOpen} renderIcon={renderIcon} renderMeta={renderMeta} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 任务产物、技能文件、专家文件共用的文件夹树：文件夹在前按名称排序、带文件数，单链文件夹合并，
 * 20 个文件以内全部展开，否则只开最外一层（`reveal` 所在的各层也开）。点文件调用 `onOpen`，怎么预览由调用方决定。
 */
export function FileTree<T extends TreeEntry>({
  entries,
  onOpen,
  label = "文件树",
  selected,
  reveal,
  renderIcon,
  renderMeta,
  className = "",
}: {
  readonly entries: readonly T[];
  readonly onOpen: (entry: T) => void;
  readonly label?: string;
  readonly selected?: string | null;
  readonly reveal?: string | null;
  /** 换掉默认的文件图标。 */
  readonly renderIcon?: (entry: T) => ReactNode;
  /** 换掉每行右侧默认的大小。 */
  readonly renderMeta?: (entry: T) => ReactNode;
  readonly className?: string;
}) {
  const tree = useMemo(() => buildFileTree(entries), [entries]);
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  // 默认展开集合随文件变化重算；人手动点过的文件夹取反，不会因为新文件到达而弹回去。
  const open = useMemo(() => {
    const base = new Set(initialExpanded(tree, entries.length, reveal));
    for (const path of toggled) {
      if (base.has(path)) base.delete(path);
      else base.add(path);
    }
    return base;
  }, [tree, entries.length, reveal, toggled]);
  const toggle = (path: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <div className={className}>
      <Level nodes={tree} depth={0} label={label} open={open} selected={selected} onToggle={toggle} onOpen={onOpen} renderIcon={renderIcon} renderMeta={renderMeta} />
    </div>
  );
}
