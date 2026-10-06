import { lazy, Suspense } from "react";

// Markdown 带着 Mermaid 的加载器，不放进入口包，文字出现时才加载。
const Markdown = lazy(() => import("./Markdown").then((module) => ({ default: module.Markdown })));

/**
 * 渲染 Agent 输出。Markdown 还没加载完时先显示纯文本，不会闪空白。
 * `math={false}` 给用户自己写的文字用：命令里的 `$` 保持原样，不当公式。目前所有调用方渲染的都是 Agent 或产物文本，默认开着。
 */
export function RichText({ text, streaming = false, math = true }: { text: string; streaming?: boolean; math?: boolean }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap text-body text-foreground">{text}</p>}>
      <div className={streaming ? "md-streaming" : undefined}>
        <Markdown text={text} streaming={streaming} math={math} />
      </div>
    </Suspense>
  );
}
