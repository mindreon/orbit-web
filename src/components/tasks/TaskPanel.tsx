import { LayoutList, PanelRightClose, X } from "lucide-react";
import { fileKey, latestByName, type ArtifactFile } from "../../lib/artifacts";
import { cn } from "../../lib/cn";
import type { AttemptView } from "../../lib/taskEvents";
import type { Plan, TaskEvent } from "../../lib/tasks";
import { ArtifactPreview } from "../conversation/ArtifactPreview";
import { FileIcon } from "../conversation/ArtifactCards";
import { AttemptTimeline } from "./AttemptTimeline";
import { EventLog } from "./EventLog";
import { FileList } from "./FileList";
import { PlanGraph } from "./PlanGraph";

export const OVERVIEW = "overview";

interface TaskPanelProps {
  readonly plan: Plan | null;
  readonly attempts: readonly AttemptView[];
  readonly events: readonly TaskEvent[];
  readonly files: readonly ArtifactFile[];
  /** 已打开的预览标签，概览标签始终在最前。 */
  readonly openFiles: readonly ArtifactFile[];
  readonly active: string;
  readonly onActivate: (key: string) => void;
  readonly onOpenFile: (file: ArtifactFile) => void;
  readonly onCloseFile: (key: string) => void;
  readonly onCollapse: () => void;
}

const TAB = "flex h-8 max-w-[10rem] items-center gap-1.5 rounded-lg px-2.5 text-sm";

/** 右侧详情面板：像浏览器标签页，第一个是任务概览，点产物会多开一个预览标签。 */
export function TaskPanel({ plan, attempts, events, files, openFiles, active, onActivate, onOpenFile, onCloseFile, onCollapse }: TaskPanelProps) {
  const activeFile = openFiles.find((file) => fileKey(file) === active);
  return (
    <aside aria-label="任务详情" className="flex min-h-0 w-[26rem] shrink-0 flex-col border-l border-border bg-card max-xl:w-[22rem]">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <button type="button" aria-label="概览" aria-pressed={active === OVERVIEW} className={cn(TAB, "px-2", active === OVERVIEW ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary")} onClick={() => onActivate(OVERVIEW)}>
          <LayoutList aria-hidden="true" className="h-4 w-4" />
          概览
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {openFiles.map((file) => {
            const key = fileKey(file);
            return (
              <span key={key} className={cn(TAB, "shrink-0", active === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary")}>
                <button type="button" className="flex min-w-0 items-center gap-1.5" onClick={() => onActivate(key)}>
                  <FileIcon file={file} size="sm" />
                  <span className="truncate">{file.name}</span>
                </button>
                <button type="button" aria-label={`关闭 ${file.name}`} className="rounded p-0.5 hover:bg-card" onClick={() => onCloseFile(key)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
        <button type="button" aria-label="收起详情" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={onCollapse}>
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      {activeFile ? (
        <ArtifactPreview key={fileKey(activeFile)} file={activeFile} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted p-4">
          <PlanGraph plan={plan} />
          <AttemptTimeline attempts={attempts} />
          <FileList files={latestByName(files)} onOpen={onOpenFile} />
          <details className="mt-6 rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-foreground">事件日志（{events.filter((event) => event.seq > 0).length}）</summary>
            <EventLog events={events} />
          </details>
        </div>
      )}
    </aside>
  );
}
