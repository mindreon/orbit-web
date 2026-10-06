import { ArrowUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { COARSE_POINTER, useMediaQuery } from "../lib/useMediaQuery";
import { useNavigate } from "react-router";
import { PermissionChip } from "../components/tasks/PermissionChip";
import { ModelSelector } from "../components/tasks/ModelSelector";
import { describeFailure } from "../lib/api";
import { ConfigChips } from "../components/tasks/ConfigChips";
import { FileChips, filesToAttachmentText, useLocalFiles } from "../components/tasks/LocalFiles";
import { ConfigMenu } from "../components/tasks/ConfigMenu";
import { useConfigCatalog } from "../lib/configCatalog";
import { draftToInput, emptyDraft, isDefaultDraft, type ConfigDraft } from "../lib/taskConfig";
import { createTask } from "../lib/tasks";
import { useTasksStore } from "../lib/tasksStore";
import { Alert } from "../ui/Alert";

const EXAMPLES = ["梳理本周发布风险", "给这个 PR 写一份审查清单", "总结当前待审批的事项"];
const TITLE_MAX = 30;

/** 标题取目标的第一行，太长就截断，不用再让你另外起名字。 */
export function deriveTitle(goal: string) {
  const first = goal
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "";
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX)}…` : first;
}

/** 新建任务：一个大输入框，写下目标回车就开始，像 WorkBuddy 的首页。 */
export function NewTaskPage() {
  const navigate = useNavigate();
  const touch = useMediaQuery(COARSE_POINTER);
  const upsert = useTasksStore((state) => state.upsert);
  const [goal, setGoal] = useState("");
  const catalog = useConfigCatalog();
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const local = useLocalFiles();
  const [fileNotice, setFileNotice] = useState("");
  const empty = goal.trim() === "";

  const submit = async () => {
    if (empty || sending) return;
    setSending(true);
    setError("");
    try {
      const { text, warnings } = await filesToAttachmentText(local.files);
      const created = await createTask({ title: deriveTitle(goal), goal: goal.trim() + text, ...(isDefaultDraft(draft) ? {} : { config: draftToInput(draft) }) });
      setFileNotice(warnings.join("；"));
      upsert(created);
      navigate(`/tasks/${created.task_id}`);
    } catch (err) {
      setError(describeFailure("创建任务失败", err));
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-card px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-center text-heading font-semibold text-foreground sm:text-display">Orbit，我帮你</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="h-8 rounded-full bg-secondary px-3 text-body text-gray-700 hover:bg-gray-200" onClick={() => setGoal(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="mt-5 w-full max-w-3xl">
        <div className="rounded-card bg-card shadow-md ring-1 ring-border focus-within:ring-primary-500">
          {local.input}
          {/* 已选的技能/专家内嵌在输入行里，和 WorkBuddy 一致 */}
          <div className="flex items-start">
            <ConfigChips draft={draft} onChange={setDraft} catalog={catalog} />
            <FileChips files={local.files} onRemove={local.removeAt} />
            <textarea
              value={goal}
              autoFocus
              rows={3}
              aria-label="任务目标"
              placeholder={touch ? "今天帮你做些什么？写下目标，点右下角的箭头开始" : "今天帮你做些什么？写下目标，Enter 开始，Shift+Enter 换行"}
              className="block max-h-64 min-h-[5.5rem] min-w-0 flex-1 resize-none bg-transparent px-4 pt-4 text-title text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <ConfigMenu draft={draft} onChange={setDraft} catalog={catalog} onAddFile={local.pick} />
            <PermissionChip />
            <span className="ml-auto" />
            {/* 提示词优化要一个改写输入的模型端点，后端还没有：先按 WorkBuddy 的样子占位。 */}
            <button
              type="button"
              aria-label="提示词优化"
              title="提示词优化（即将开放）"
              disabled
              className="flex h-8 w-8 items-center justify-center rounded-control text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </button>
            <ModelSelector draft={draft} onChange={setDraft} catalog={catalog} />
            <button
              type="button"
              aria-label="开始任务"
              disabled={empty || sending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-secondary disabled:text-gray-500"
              onClick={() => void submit()}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        {fileNotice ? <p role="status" className="mt-3 text-center text-small text-warning-700">{fileNotice}</p> : null}
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <p className="mt-3 text-center text-small text-muted-foreground">内容由 AI 生成，请核实重要信息</p>
      </div>
    </div>
  );
}
