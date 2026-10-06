import { Check, Copy, Database } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "../../lib/cn";
import type { TurnUsage } from "../../lib/conversation";
import { COARSE_POINTER, useMediaQuery } from "../../lib/useMediaQuery";

/**
 * The row of small actions under a message (the message carries `relative group/msg`). Where it is always shown (the last reply,
 * touch screens, where there is no hover to find it by) it is an ordinary row below the message. Everywhere else it hangs just
 * under the message, inside the gap before the next one, so it reserves no height: it appears on hover and while focus is
 * inside the message, and being a part of the message it keeps the hover while the pointer travels down to it.
 */
export function ActionRow({ always = false, align = "start", testId, children }: { always?: boolean; align?: "start" | "end"; testId: string; children: React.ReactNode }) {
  const touch = useMediaQuery(COARSE_POINTER);
  const shown = always || touch;
  return (
    <div
      data-testid={testId}
      data-shown={shown ? "true" : undefined}
      className={cn(
        "flex items-center gap-1 text-caption text-muted-foreground transition-opacity",
        align === "end" && "justify-end",
        // `!mt-0`: the message's `space-y` would push an absolutely placed row down by its own gap.
        shown ? "opacity-100" : "absolute inset-x-0 top-full !mt-0 opacity-0 group-focus-within/msg:opacity-100 group-hover/msg:opacity-100",
      )}
    >
      {children}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "已复制" : label}
      className="flex h-7 w-7 items-center justify-center rounded-control text-gray-500 hover:bg-gray-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-4 w-4 text-success-700" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

const NUMBER = new Intl.NumberFormat("zh-CN");

/** Tokens the attempt used, in a popover that opens on hover and on focus. Only what the events report: no cache figure exists, so none is shown. */
export function UsageButton({ usage }: { usage: TurnUsage }) {
  const id = useId();
  const rows: ReadonlyArray<readonly [string, number]> = [
    ["输入", usage.tokensIn],
    ["输出", usage.tokensOut],
    ["总计", usage.tokensIn + usage.tokensOut],
  ];
  return (
    <span className="group/usage relative">
      <button
        type="button"
        aria-label="用量"
        aria-describedby={id}
        className="flex h-7 w-7 items-center justify-center rounded-control text-gray-500 hover:bg-gray-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Database aria-hidden="true" className="h-4 w-4" />
      </button>
      <div
        id={id}
        role="tooltip"
        data-testid="usage-popover"
        className="invisible absolute bottom-full left-0 z-20 mb-1 w-44 rounded-card border border-border bg-card p-3 text-caption text-gray-700 shadow-md group-focus-within/usage:visible group-hover/usage:visible"
      >
        <dl className="space-y-1">
          {rows.map(([name, value]) => (
            <div key={name} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{name}</dt>
              <dd className="font-medium tabular-nums text-foreground">{NUMBER.format(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </span>
  );
}
