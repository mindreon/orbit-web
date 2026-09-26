import { useState } from "react";
import { mockArtifacts } from "../lib/mockRooms";
import { publishTaskShare, taskShareLink } from "../lib/shares";

export function ShareTaskDialog({ matterId, title, onClose }: { matterId: string; title: string; onClose: () => void }) {
  const files = mockArtifacts(matterId);
  const [status, setStatus] = useState<"idle" | "generating" | "copied" | "failed">("idle");

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-sm" role="dialog" aria-label="分享">
      <p className="font-medium">分享</p>
      <p className="mt-2 text-[#666]">{title}</p>
      {files.length === 0 ? (
        <p className="mt-3 text-[#888]">暂无产物</p>
      ) : (
        <div className="mt-3">
          <p className="text-[#444]">{`本次任务包含以下产物（${files.length}）`}</p>
          <ul className="mt-2 space-y-1 text-[#666]">
            {files.map((file) => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-white"
          disabled={status === "generating"}
          onClick={() => {
            setStatus("generating");
            window.setTimeout(() => {
              const link = publishTaskShare(matterId, title) || taskShareLink(matterId);
              void navigator.clipboard.writeText(link).then(
                () => setStatus("copied"),
                () => setStatus("failed"),
              );
            }, 300);
          }}
        >
          {status === "generating" ? "正在生成分享链接..." : status === "copied" ? "已复制链接" : status === "failed" ? "复制链接失败" : "复制链接"}
        </button>
      </div>
    </div>
  );
}
