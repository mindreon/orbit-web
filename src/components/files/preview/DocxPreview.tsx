import { useEffect, useRef, useState } from "react";
import { Skeleton } from "../../../ui/Skeleton";
import type { PreviewProps } from "./types";

/** Word documents laid out as pages by docx-preview. Approximate: fonts and some objects differ from Word. */
export default function DocxPreview({ blob }: PreviewProps) {
  const body = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const host = body.current;
    if (!blob || !host) return;
    let gone = false;
    setState("loading");
    void import("docx-preview")
      .then(({ renderAsync }) => renderAsync(blob, host, undefined, { className: "docx", inWrapper: true, ignoreLastRenderedPageBreak: false }))
      .then(() => !gone && setState("ready"))
      .catch(() => !gone && setState("error"));
    return () => {
      gone = true;
      host.replaceChildren();
    };
  }, [blob]);
  return (
    <div data-testid="docx-preview" className="min-h-full bg-gray-100">
      {state === "loading" ? <Skeleton className="m-4 h-48" /> : null}
      {state === "error" ? <p className="p-5 text-body text-muted-foreground">文档无法打开，请下载查看</p> : null}
      <div ref={body} className="overflow-auto" />
    </div>
  );
}
