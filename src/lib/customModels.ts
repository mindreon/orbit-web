/** 自定义模型只留在这次打开的页面里，不写入本机 models.json。 */

export const MODEL_EFFORTS = [
  { id: "minimal", label: "低" },
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
  { id: "xhigh", label: "超高" },
  { id: "max", label: "极致" },
] as const;

export type ModelEffort = (typeof MODEL_EFFORTS)[number]["id"];

export type CustomModel = {
  id: string;
  provider: string;
  endpoint: string;
  apiKey: string;
  hidden: boolean;
  maxInputTokens: string;
  maxOutputTokens: string;
  reasoning: boolean;
  onlyReasoning: boolean;
  canDisableThinking: boolean;
  defaultEffort: "" | ModelEffort;
  supportedEfforts: ModelEffort[];
  tools: boolean;
  images: boolean;
  customProtocol: boolean;
};

export type CustomModelInput = {
  provider: string;
  endpoint: string;
  apiKey: string;
  modelId: string;
  maxInputTokens: string;
  maxOutputTokens: string;
  reasoning: boolean;
  onlyReasoning: boolean;
  canDisableThinking: boolean;
  defaultEffort: "" | ModelEffort;
  supportedEfforts: ModelEffort[];
  tools: boolean;
  images: boolean;
  customProtocol: boolean;
};

export const MODEL_PROVIDERS = [
  "智谱 Coding Plan",
  "Kimi Coding Plan",
  "智谱开放平台",
  "Kimi 国际版",
  "Kimi 中国版",
  "MiniMax 国际版",
  "MiniMax 中国版",
  "深度求索",
  "OpenAI 官方",
  "谷歌 Gemini",
  "OpenRouter 聚合",
  "自定义",
] as const;

let models: CustomModel[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getCustomModels() {
  return models;
}

export function subscribeCustomModels(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function modelProblem(input: { provider: string; endpoint: string; apiKey: string; modelId: string; customProtocol?: boolean }) {
  if (!input.provider) return "请先选择提供商";
  if (!input.modelId.trim()) return "请输入模型名称";
  if (!input.endpoint.trim()) return "请输入接口地址";
  let url: URL;
  try {
    url = new URL(input.endpoint.trim());
  } catch {
    return "接口地址格式不正确";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "接口地址格式不正确";
  if (!input.customProtocol && !input.endpoint.trim().endsWith("/chat/completions")) return "必须以 /chat/completions 结尾";
  if (!input.apiKey) return "请输入 API Key";
  if (!/^[\x21-\x7E]+$/.test(input.apiKey)) return "API Key 格式不正确，请去掉空格、换行和全角字符";
  return null;
}

export function saveCustomModel(input: CustomModelInput) {
  const id = input.modelId.trim();
  const next: CustomModel = {
    id,
    provider: input.provider,
    endpoint: input.endpoint.trim(),
    apiKey: input.apiKey,
    hidden: models.find((item) => item.id === id)?.hidden ?? false,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    reasoning: input.reasoning,
    onlyReasoning: input.onlyReasoning,
    canDisableThinking: input.canDisableThinking,
    defaultEffort: input.defaultEffort,
    supportedEfforts: input.supportedEfforts,
    tools: input.tools,
    images: input.images,
    customProtocol: input.customProtocol,
  };
  models = [next, ...models.filter((item) => item.id !== id)];
  emit();
}

export function removeCustomModel(id: string) {
  models = models.filter((item) => item.id !== id);
  emit();
}

export function setCustomModelHidden(id: string, hidden: boolean) {
  models = models.map((item) => (item.id === id ? { ...item, hidden } : item));
  emit();
}
