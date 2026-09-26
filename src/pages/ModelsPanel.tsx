import { useState, useSyncExternalStore } from "react";
import {
  MODEL_EFFORTS,
  MODEL_PROVIDERS,
  type ModelEffort,
  getCustomModels,
  modelProblem,
  removeCustomModel,
  saveCustomModel,
  setCustomModelHidden,
  subscribeCustomModels,
} from "../lib/customModels";

const EMPTY = {
  provider: "",
  endpoint: "",
  apiKey: "",
  modelId: "",
  maxInputTokens: "",
  maxOutputTokens: "",
  reasoning: false,
  onlyReasoning: false,
  canDisableThinking: false,
  defaultEffort: "" as "" | ModelEffort,
  supportedEfforts: [] as ModelEffort[],
  tools: false,
  images: false,
  customProtocol: false,
};

function effortLabel(id: ModelEffort) {
  return MODEL_EFFORTS.find((item) => item.id === id)?.label ?? id;
}

export function ModelsPanel() {
  const models = useSyncExternalStore(subscribeCustomModels, getCustomModels, getCustomModels);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  function patch(partial: Partial<typeof EMPTY>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function closeForm() {
    setOpen(false);
    setForm(EMPTY);
    setOverwrite(false);
    setAdvanced(false);
  }

  function toggleEffort(id: ModelEffort) {
    patch({
      supportedEfforts: form.supportedEfforts.includes(id) ? form.supportedEfforts.filter((item) => item !== id) : [...form.supportedEfforts, id],
    });
  }

  function save() {
    const problem = modelProblem(form);
    if (problem) {
      setNotice(problem);
      return;
    }
    if (models.some((item) => item.id === form.modelId.trim()) && !overwrite) {
      setOverwrite(true);
      return;
    }
    saveCustomModel(form);
    closeForm();
    setNotice("");
  }

  return (
    <div className="mt-6 max-w-lg text-sm">
      <div className="flex items-center gap-3">
        <p className="font-medium">自定义模型</p>
        <button type="button" className="ml-auto rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={() => setOpen(true)}>
          添加模型
        </button>
      </div>
      <p className="mt-2 text-xs text-[#888]">仅支持 OpenAI 兼容协议 API</p>
      {models.length === 0 ? <p className="mt-4 text-[#888]">还没有配置自定义模型</p> : null}
      {models.length > 0 ? (
        <div className="mt-4">
          <p className="font-medium">已保存模型</p>
          <ul className="mt-2 space-y-2">
            {models.map((item) => (
              <li key={item.id} className="rounded-xl bg-white px-4 py-3">
                <p className="font-medium">{item.id}</p>
                <p className="mt-1 text-xs text-[#888]">{item.provider}</p>
                {item.maxInputTokens || item.maxOutputTokens ? (
                  <p className="mt-1 text-xs text-[#888]">
                    {item.maxInputTokens ? `输入 ${item.maxInputTokens}` : ""}
                    {item.maxInputTokens && item.maxOutputTokens ? " · " : ""}
                    {item.maxOutputTokens ? `输出 ${item.maxOutputTokens}` : ""}
                  </p>
                ) : null}
                {item.reasoning ? <p className="mt-1 text-xs text-[#888]">思考模式{item.defaultEffort ? ` · ${effortLabel(item.defaultEffort)}` : ""}</p> : null}
                <div className="mt-2 flex gap-3">
                  <button type="button" className="text-[#666]" onClick={() => setCustomModelHidden(item.id, !item.hidden)}>
                    {item.hidden ? "显示" : "隐藏"}
                  </button>
                  <button type="button" className="text-[#666]" onClick={() => setDeleteId(item.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notice && !open ? <p className="mt-3 text-[#444]">{notice}</p> : null}
      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <form
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5"
            role="dialog"
            aria-label="添加模型"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <p className="font-medium">添加模型</p>
            <p className="mt-1 text-xs text-[#888]">仅支持 OpenAI 兼容协议 API</p>
            <label className="mt-4 block">
              供应商（仅支持 OpenAI 兼容协议 API）
              <select aria-label="请选择提供商" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.provider} onChange={(event) => patch({ provider: event.target.value })}>
                <option value="">请选择提供商</option>
                {MODEL_PROVIDERS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              接口地址
              <input aria-label="接口地址" placeholder="https://api.example.com/v1/chat/completions" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.endpoint} onChange={(event) => patch({ endpoint: event.target.value })} />
            </label>
            <label className="mt-3 block">
              API Key
              <input aria-label="API Key" placeholder="输入你的 API Key" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} />
            </label>
            <label className="mt-3 block">
              模型名称
              <input aria-label="模型名称" placeholder="输入模型参数值，例如 gpt-4o 或 openai/gpt-4o" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.modelId} onChange={(event) => patch({ modelId: event.target.value })} />
            </label>
            <button type="button" className="mt-4 text-sm" aria-expanded={advanced} onClick={() => setAdvanced((current) => !current)}>
              高级配置
            </button>
            {advanced ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  最大输入 Token
                  <p className="text-xs text-[#888]">单次请求可接受的最大上下文长度。留空时跟随提供商默认值。</p>
                  <input aria-label="最大输入 Token" inputMode="numeric" placeholder="使用提供商默认值" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.maxInputTokens} onChange={(event) => patch({ maxInputTokens: event.target.value.replace(/\D/g, "") })} />
                </label>
                <label className="block">
                  最大输出 Token
                  <p className="text-xs text-[#888]">单次回复可生成的最大 Token 数。留空时跟随提供商默认值。</p>
                  <input aria-label="最大输出 Token" inputMode="numeric" placeholder="使用提供商默认值" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.maxOutputTokens} onChange={(event) => patch({ maxOutputTokens: event.target.value.replace(/\D/g, "") })} />
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.reasoning} onChange={(event) => patch({ reasoning: event.target.checked })} />
                  <span>
                    思考模式
                    <span className="mt-1 block text-xs text-[#888]">将该模型标记为思考模型，客户端会据此开启相关能力和交互。</span>
                  </span>
                </label>
                <label className="block">
                  默认思考强度
                  <p className="text-xs text-[#888]">开启思考模式但未手动选择强度时使用的默认档位。留空时由请求层选择默认值。</p>
                  <select aria-label="默认思考强度" className="mt-1 h-9 w-full rounded-lg border border-[#e6e6e8] px-2" value={form.defaultEffort} onChange={(event) => patch({ defaultEffort: event.target.value as "" | ModelEffort })}>
                    <option value="">自动（使用请求层默认值）</option>
                    {MODEL_EFFORTS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <p>支持的思考强度</p>
                  <p className="text-xs text-[#888]">模型选择器里展示的思考强度档位。留空表示只支持思考开关，不展示强度选择。</p>
                  {form.supportedEfforts.length === 0 ? <p className="mt-1 text-xs text-[#888]">当前只会展示思考开关，不会展示强度选择；如果该模型支持强度调节，请在下方选择可用档位。</p> : null}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {MODEL_EFFORTS.map((item) => (
                      <label key={item.id} className="flex items-center gap-1">
                        <input type="checkbox" aria-label={item.label} checked={form.supportedEfforts.includes(item.id)} onChange={() => toggleEffort(item.id)} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.onlyReasoning} onChange={(event) => patch({ onlyReasoning: event.target.checked })} />
                  <span>
                    仅思考模式
                    <span className="mt-1 block text-xs text-[#888]">模型只能以思考模式运行，模型选择器不会展示关闭思考的入口。</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.canDisableThinking} onChange={(event) => patch({ canDisableThinking: event.target.checked })} />
                  <span>
                    允许关闭思考
                    <span className="mt-1 block text-xs text-[#888]">允许用户关闭思考模式。对于无法关闭思考的模型或接口，请取消勾选。</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.tools} onChange={(event) => patch({ tools: event.target.checked })} />
                  <span>
                    工具调用
                    <span className="mt-1 block text-xs text-[#888]">允许模型调用智能体运行时暴露出来的工具和函数。</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.images} onChange={(event) => patch({ images: event.target.checked })} />
                  <span>
                    图片输入
                    <span className="mt-1 block text-xs text-[#888]">允许在聊天时向该模型发送图片附件。</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={form.customProtocol} onChange={(event) => patch({ customProtocol: event.target.checked })} />
                  <span>
                    自定义协议
                    <span className="mt-1 block text-xs text-[#888]">开启后将直接使用填写的接口地址，不再自动补全 /chat/completions 路径。适用于代理层或服务端已自行处理协议的场景。</span>
                  </span>
                </label>
              </div>
            ) : null}
            {notice && open ? <p className="mt-3 text-[#444]">{notice}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="cursor-not-allowed text-[#b0b0b0] disabled:cursor-not-allowed"
              >
                测试连接 · 未接入
              </button>
              <button type="button" onClick={closeForm}>
                取消
              </button>
              <button type="submit" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {overwrite ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="覆盖现有模型">
            <p className="font-medium">覆盖现有模型</p>
            <p className="mt-2 text-[#666]">{`模型 ID ${form.modelId.trim()} 已存在，是否用当前配置覆盖？`}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOverwrite(false)}>
                取消
              </button>
              <button type="button" className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white" onClick={save}>
                覆盖并保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" role="dialog" aria-label="删除模型">
            <p className="font-medium">删除模型</p>
            <p className="mt-2 text-[#666]">{`确认删除模型 ${deleteId} 吗？`}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
                onClick={() => {
                  removeCustomModel(deleteId);
                  setDeleteId(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
