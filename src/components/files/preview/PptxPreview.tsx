import { useEffect, useRef, useState } from "react";
import { Skeleton } from "../../../ui/Skeleton";
import type { PreviewProps } from "./types";

/** Slides drawn in the browser by pptx-preview. Approximate (fonts, animations and some shapes differ): the shell keeps 下载 in view. */
export default function PptxPreview({ blob }: PreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const node = host.current;
    if (!blob || !node) return;
    let gone = false;
    let destroy: (() => void) | undefined;
    setState("loading");
    void Promise.all([import("pptx-preview"), blob.arrayBuffer()])
      .then(async ([{ init }, buffer]) => {
        if (gone) return;
        const width = Math.max(320, Math.floor(node.clientWidth) - 32);
        const previewer = init(node, { width, height: Math.floor((width * 9) / 16), mode: "list" });
        destroy = () => previewer.destroy();
        await previewer.preview(buffer);
        if (!gone) setState("ready");
      })
      .catch(() => !gone && setState("error"));
    return () => {
      gone = true;
      destroy?.();
      node.replaceChildren();
    };
  }, [blob]);
  return (
    <div data-testid="pptx-preview" className="min-h-full bg-gray-100">
      {state === "loading" ? <Skeleton className="m-4 h-48" /> : null}
      {state === "error" ? <p className="p-5 text-body text-muted-foreground">幻灯片无法打开，请下载查看</p> : null}
      <div ref={host} className="mx-auto w-full p-4" />
    </div>
  );
}
