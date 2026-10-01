import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PermissionChip } from "../components/tasks/PermissionChip";
import { describeFailure } from "../lib/api";
import { ConfigChips } from "../components/tasks/ConfigChips";
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
  const upsert = useTasksStore((state) => state.upsert);
  const [goal, setGoal] = useState("");
  const catalog = useConfigCatalog();
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const empty = goal.trim() === "";

  const submit = async () => {
    if (empty || sending) return;
    setSending(true);
    setError("");
    try {
      const created = await createTask({ title: deriveTitle(goal), goal: goal.trim(), ...(isDefaultDraft(draft) ? {} : { config: draftToInput(draft) }) });
      upsert(created);
      navigate(`/tasks/${created.task_id}`);
    } catch (err) {
      setError(describeFailure("创建任务失败", err));
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-card px-6 py-10">
      <h1 className="text-3xl font-semibold text-foreground">Orbit，我帮你</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="h-8 rounded-full border border-border bg-card px-3 text-sm text-foreground/80 hover:bg-secondary" onClick={() => setGoal(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="mt-5 w-full max-w-3xl">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-primary/50">
          <textarea
            value={goal}
            autoFocus
            rows={3}
            aria-label="任务目标"
            placeholder="今天帮你做些什么？写下目标，Enter 开始，Shift+Enter 换行"
            className="block max-h-64 min-h-[5.5rem] w-full resize-none bg-transparent px-4 pt-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => setGoal(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <ConfigChips draft={draft} onChange={setDraft} catalog={catalog} />
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <ConfigMenu draft={draft} onChange={setDraft} catalog={catalog} />
            <PermissionChip />
            <span className="ml-auto" />
            <button
              type="button"
              aria-label="开始任务"
              disabled={empty || sending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground"
              onClick={() => void submit()}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <p className="mt-3 text-center text-xs text-muted-foreground">内容由 AI 生成，请核实重要信息</p>
      </div>
    </div>
  );
}
