import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { SCENES } from "../shell/nav";
import { useMind } from "../store";
import type { PermissionPreset } from "../model";
import { cn } from "../lib/cn";
import { ModelPicker } from "./ModelPicker";
import { AppMenu } from "./AppMenu";
import { CloudFileDialog, ComposerSuggest } from "./Workbench";
import { mockArtifacts } from "../lib/mockRooms";
import { getUiPrefs, subscribeUiPrefs } from "../lib/uiPrefs";

const ADD_ITEMS = ["添加文件", "引用对话中的文件", "应用", "模式", "权限", "专家", "技能", "连接器"] as const;

export function HomePage() {
  const navigate = useNavigate();
  const role = useMind((s) => s.role);
  const createMatter = useMind((s) => s.createMatter);
  const pending = useMind((s) => s.pending);
  const error = useMind((s) => s.error);
  const catalog = useMind((s) => s.catalog);
  const matters = useMind((s) => s.matters);
  const uiPrefs = useSyncExternalStore(subscribeUiPrefs, getUiPrefs);
  const [sceneId, setSceneId] = useState<(typeof SCENES)[number]["id"]>("work");
  const [recommendQuick, setRecommendQuick] = useState(true);
  const [casePage, setCasePage] = useState(0);
  const [casesOpen, setCasesOpen] = useState(true);
  const [casesAll, setCasesAll] = useState(false);
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get("prompt") ?? "");
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [permission, setPermission] = useState<PermissionPreset>("workspace-write");
  const [quick, setQuick] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPanel, setAddPanel] = useState<(typeof ADD_ITEMS)[number] | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [fullConfirm, setFullConfirm] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);
  const [sent, setSent] = useState(false);
  const [expert, setExpert] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [connector, setConnector] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [model, setModel] = useState("Auto");
  const scene = SCENES.find((item) => item.id === sceneId) ?? SCENES[0];
  const casePageSize = 3;
  const casePageCount = Math.max(1, Math.ceil(scene.chips.length / casePageSize));
  const visibleCases = casesAll ? scene.chips : scene.chips.slice(casePage * casePageSize, casePage * casePageSize + casePageSize);
  const caseHeading = sceneId === "design" ? "试试精选案例" : "不知道做什么，试试最佳实践案例";

  useEffect(() => {
    setCasePage(0);
    setCasesAll(false);
  }, [sceneId]);

  useEffect(() => {
    if (params.get("quick") !== "1") return;
    if (expert) setQuickNotice("当前已选择专家，暂不支持快速问答模式");
    else if (skill) setQuickNotice("当前输入的内容包含技能，暂不支持快速问答模式");
    else if (connector) setQuickNotice("当前输入的内容包含连接器，暂不支持快速问答模式");
    else {
      setQuick(true);
      setDraft("");
      setQuickNotice("已切换到快速问答模式");
    }
    const next = new URLSearchParams(params);
    next.delete("quick");
    setParams(next, { replace: true });
  }, [params, expert, skill, connector, setParams]);

  useEffect(() => {
    function onSend() {
      formRef.current?.requestSubmit();
    }
    function onNewline() {
      const area = formRef.current?.querySelector("textarea");
      if (!(area instanceof HTMLTextAreaElement) || document.activeElement !== area) return;
      const start = area.selectionStart;
      const next = `${area.value.slice(0, start)}\n${area.value.slice(area.selectionEnd)}`;
      setDraft(next);
      requestAnimationFrame(() => {
        area.focus();
        area.selectionStart = area.selectionEnd = start + 1;
      });
    }
    function onVoice() {
      setVoiceNotice("当前环境不支持语音输入。");
    }
    window.addEventListener("mind-send-message", onSend);
    window.addEventListener("mind-insert-newline", onNewline);
    window.addEventListener("mind-toggle-voice", onVoice);
    return () => {
      window.removeEventListener("mind-send-message", onSend);
      window.removeEventListener("mind-insert-newline", onNewline);
      window.removeEventListener("mind-toggle-voice", onVoice);
    };
  }, []);

  async function submit() {
    if (role !== "经办人" || !draft.trim() || pending) return;
    setSent(true);
    await createMatter(draft, permission);
    const id = useMind.getState().activeId;
    if (id && !useMind.getState().error) navigate(`/task/${id}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-[#f7f7f8] px-8 pb-16 pt-24">
      <h1 className="text-[28px] font-semibold tracking-tight text-[#1a1a1a]">MindBuddy, 我帮你</h1>
      <p className="mt-2 text-sm text-[#8a8a8a]" data-decorative>{scene.subtitle}</p>
      <div className="mt-6 flex rounded-full bg-[#ececee] p-1 text-sm" role="tablist" aria-label="场景切换">
        {SCENES.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={item.id === sceneId}
            className={cn(
              "rounded-full px-4 py-1.5",
              item.id === sceneId ? "bg-white font-medium text-[#1a1a1a] shadow-sm" : "text-[#666]",
            )}
            onClick={() => setSceneId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {casesOpen ? (
        <section className="mt-5 w-full max-w-3xl" aria-label={`${scene.label} 相关灵感`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-[#1a1a1a]">{caseHeading}</p>
            <button type="button" className="text-xs text-[#666]" onClick={() => { setCasesAll(false); setCasePage((page) => (page + 1) % casePageCount); }}>换一批</button>
            <button type="button" className="text-xs text-[#666]" onClick={() => { setCasesAll(false); setCasePage((page) => (page - 1 + casePageCount) % casePageCount); }}>上一批</button>
            <button type="button" className="text-xs text-[#666]" onClick={() => { setCasesAll(false); setCasePage((page) => (page + 1) % casePageCount); }}>下一批</button>
            <button type="button" className="text-xs text-[#666]" onClick={() => setCasesOpen(false)}>今日不再展示</button>
            <button type="button" className="text-xs text-[#666]" onClick={() => setCasesOpen(false)}>关闭</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {visibleCases.map((chip) => (
              <button
                key={chip}
                className="rounded-full border border-[#e6e6e8] bg-white px-3 py-1.5 text-sm text-[#333] hover:bg-[#fafafa]"
                onClick={() => setDraft(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          {casesAll ? null : (
            <button type="button" className="mt-2 text-xs text-[#666]" onClick={() => setCasesAll(true)}>查看更多</button>
          )}
        </section>
      ) : null}
      {recommendQuick && !quick ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button type="button" className="rounded-full bg-white px-3 py-1" onClick={() => { setQuick(true); setRecommendQuick(false); }}>
            推荐使用快速问答
          </button>
          <button type="button" className="text-[#666]" onClick={() => setRecommendQuick(false)}>
            不再推荐
          </button>
        </div>
      ) : null}
      <form
        ref={formRef}
        className="mt-6 w-full max-w-3xl rounded-2xl border border-[#ececee] bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {expert ? <Chip label={`专家 ${expert}`} onClear={() => setExpert(null)} /> : null}
          {skill ? <Chip label={`技能 ${skill}`} onClear={() => setSkill(null)} /> : null}
          {connector ? <Chip label={`连接器 ${connector}`} onClear={() => setConnector(null)} /> : null}
          {mode ? <Chip label={mode} onClear={() => setMode(null)} /> : null}
        </div>
        <ComposerSuggest matterId={null} text={draft} setText={setDraft} />
        <textarea
          value={draft}
          rows={3}
          aria-label="任务内容"
          placeholder={quick ? "快速问答模式可解答简单问题，任务仍在云端运行" : "今天帮你做些什么？ @ 添加上下文，/调用技能与指令"}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#b0b0b0]"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="mt-2 flex items-center gap-2 text-sm text-[#666]">
          <div className="relative">
            <button
              type="button"
              aria-label="更多操作"
              aria-expanded={addOpen}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#f3f3f4]"
              onClick={() => {
                setAddOpen((open) => !open);
                setAddPanel(null);
              }}
            >
              +
            </button>
            {addOpen ? (
              <div className="absolute bottom-10 left-0 z-20 w-52 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
                {ADD_ITEMS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                    onClick={() => {
                      if (item === "添加文件" || item === "引用对话中的文件") {
                        if (quick) {
                          setQuickNotice("快速问答模式暂不支持添加图片或文件");
                          setAddOpen(false);
                          setAddPanel(null);
                          return;
                        }
                      }
                      if (item === "添加文件") {
                        setCloudOpen(true);
                        setAddOpen(false);
                        setAddPanel(null);
                        return;
                      }
                      setAddPanel(item);
                    }}
                  >
                    {item}
                  </button>
                ))}
                {addPanel === "专家" ? (
                  <PickerList items={catalog.agents.map((item) => item.name)} empty="暂无可用专家" onPick={(name) => { if (quick) { setQuickNotice("当前已选择专家，暂不支持快速问答模式"); setAddOpen(false); return; } setExpert(name); setAddOpen(false); }} />
                ) : null}
                {addPanel === "技能" ? (
                  <PickerList items={catalog.skills.map((item) => item.name)} empty="暂无可用技能" onPick={(name) => { if (quick) { setQuickNotice("当前输入的内容包含技能，暂不支持快速问答模式"); setAddOpen(false); return; } setSkill(name); setAddOpen(false); }} />
                ) : null}
                {addPanel === "连接器" ? (
                  <PickerList items={catalog.mcps.map((item) => item.name)} empty="暂无可用连接器" onPick={(name) => { if (quick) { setQuickNotice("当前输入的内容包含连接器，暂不支持快速问答模式"); setAddOpen(false); return; } setConnector(name); setAddOpen(false); }} />
                ) : null}
                {addPanel === "模式" ? (
                  <PickerList items={["计划", "仅问答"]} empty="" onPick={(name) => { setMode(name); setAddOpen(false); }} />
                ) : null}
                {addPanel === "应用" ? (
                  <AppMenu
                    matterId={null}
                    onPick={(app) => {
                      setDraft((current) => (current.includes(app.name) ? current : `${app.name}${current ? ` ${current}` : ""}`));
                      setAddOpen(false);
                    }}
                  />
                ) : null}
                {addPanel === "引用对话中的文件" ? (
                  <p className="px-3 py-2 text-xs text-[#888]">当前对话中暂无文件</p>
                ) : null}
                {addPanel === "权限" ? (
                  <p className="text-muted-foreground px-3 py-2 text-xs">默认权限在云端沙箱内执行。完全访问只作用于这一件云端任务。</p>
                ) : null}
              </div>
            ) : null}
            {cloudOpen ? (
              <CloudFileDialog
                files={matters.flatMap((matter) => mockArtifacts(matter.id).map((file) => file.name))}
                onClose={() => setCloudOpen(false)}
                onAdd={(name) => {
                  setDraft((current) => (current.includes(name) ? current : `${name}${current ? ` ${current}` : ""}`));
                  setCloudOpen(false);
                }}
              />
            ) : null}
          </div>
          <span className="text-xs text-[#888]">云端工作空间</span>
          {uiPrefs.customPrompt ? <span className="text-xs text-[#888]">{`自定义指令 · ${uiPrefs.customPrompt}`}</span> : null}
          {uiPrefs.tone !== "默认" ? <span className="text-xs text-[#888]">{`回复风格 · ${uiPrefs.tone}`}</span> : null}
          <ModelPicker value={model} onChange={setModel} />
          {model !== "Auto" ? <span className="text-xs text-[#888]">使用外部模型，注意数据安全</span> : null}
          <div className="relative">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs hover:bg-[#f3f3f4]"
              aria-expanded={permOpen}
              onClick={() => setPermOpen((open) => !open)}
            >
              {permission === "danger-full-access" ? "允许完全访问" : "默认权限"} ▾
            </button>
            {permOpen ? (
              <div className="absolute bottom-9 left-0 z-20 w-64 rounded-xl border border-[#ececee] bg-white p-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                  onClick={() => {
                    setPermission("workspace-write");
                    setPermOpen(false);
                  }}
                >
                  默认权限
                  <span className="mt-1 block text-xs text-[#888]">在云端沙箱内进行，超出范围会请求你的允许。</span>
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f6f6f7]"
                  onClick={() => {
                    setPermOpen(false);
                    setFullConfirm(true);
                  }}
                >
                  允许完全访问
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-[#f3f3f4]" onClick={() => setVoiceNotice("当前环境不支持语音输入。")}>
            语音输入
          </button>
          <button
            type="button"
            aria-pressed={quick}
            className={cn("ml-auto rounded-md px-2 py-1 text-xs", quick ? "bg-[#ececee] text-[#1a1a1a]" : "hover:bg-[#f3f3f4]")}
            onClick={() => setQuick((value) => !value)}
          >
            快速问答
          </button>
          <button
            type="submit"
            aria-label="发送"
            disabled={role !== "经办人" || pending === "create" || !draft.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white disabled:bg-[#d8d8dc]"
          >
            ↑
          </button>
        </div>
        {pending === "create" ? (
          <div className="mt-2 text-xs text-[#666]">
            <p>正在准备执行</p>
            <p className="mt-1">Agent 正在接手并进入工作状态。</p>
          </div>
        ) : null}
        {voiceNotice ? <p className="mt-2 text-xs text-[#666]">{voiceNotice}</p> : null}
        {quickNotice ? <p className="mt-2 text-xs text-[#666]">{quickNotice}</p> : null}
        {sent && error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
        {role !== "经办人" ? <p className="mt-2 text-xs text-[#888]">当前角色不能新建任务。</p> : null}
      </form>
      <p className="mt-3 text-xs text-[#999]" data-decorative>内容由 AI 生成，请核实重要信息</p>
      {fullConfirm ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-label="确认允许完全访问">
            <h2 className="text-base font-semibold">确认允许完全访问？</h2>
            <p className="mt-2 text-sm leading-6 text-[#444]">开启后，这一件云端任务会减少确认步骤。它不会改你电脑上的文件。</p>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={riskChecked} onChange={(event) => setRiskChecked(event.target.checked)} />
              我已了解风险，并对自己的数据安全负责
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm hover:bg-[#f3f3f4]"
                onClick={() => {
                  setFullConfirm(false);
                  setRiskChecked(false);
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={!riskChecked}
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-sm text-white disabled:opacity-40"
                onClick={() => {
                  setPermission("danger-full-access");
                  setFullConfirm(false);
                  setRiskChecked(false);
                }}
              >
                允许完全访问
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" className="rounded-full bg-[#f3f3f4] px-2 py-0.5 text-xs text-[#333]" onClick={onClear}>
      {label} ×
    </button>
  );
}

function PickerList({ items, empty, onPick }: { items: string[]; empty: string; onPick: (name: string) => void }) {
  if (items.length === 0) return <p className="text-muted-foreground px-3 py-2 text-xs">{empty}</p>;
  return (
    <ul className="max-h-36 overflow-auto border-t border-[#f0f0f1] px-1 py-1">
      {items.map((item) => (
        <li key={item}>
          <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-xs text-[#333] hover:bg-[#f6f6f7]" onClick={() => onPick(item)}>
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}
