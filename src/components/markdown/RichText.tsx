import { lazy, Suspense } from "react";

// Markdown 带着 Mermaid 的加载器，不放进入口包，文字出现时才加载。
const Markdown = lazy(() => import("./Markdown").then((module) => ({ default: module.Markdown })));

/** 渲染 Agent 输出。Markdown 还没加载完时先显示纯文本，不会闪空白。 */
export function RichText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <Suspense fallback={<p className="whitespace-pre-wrap text-body text-foreground">{text}</p>}>
      <div className={streaming ? "md-streaming" : undefined}>
        <Markdown text={text} streaming={streaming} />
      </div>
    </Suspense>
  );
}
