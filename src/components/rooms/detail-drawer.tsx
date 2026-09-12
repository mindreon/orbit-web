"use client";

import type { ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RosterPanel } from "@/components/rooms/roster-panel";
import { activityLabel, type DrawerTab, type RosterMember } from "@/lib/rooms-ui";
import type { ActivityEvent } from "@/lib/control";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  tab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  activity: ActivityEvent[];
  roster: RosterMember[];
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
  isCollab: boolean;
};

export function DetailDrawer({
  open,
  onClose,
  tab,
  onTabChange,
  activity,
  roster,
  focusAgentId,
  onFocusAgent,
  isCollab,
}: Props) {
  if (!open) return null;

  return (
    <aside className="flex h-full w-[19rem] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="flex gap-1">
          <TabButton active={tab === "activity"} onClick={() => onTabChange("activity")}>
            执行轨迹
          </TabButton>
          <TabButton active={tab === "roster"} onClick={() => onTabChange("roster")}>
            团队{isCollab ? ` · ${Math.max(roster.length - 1, 0)}` : ""}
          </TabButton>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="关闭详情" onClick={onClose}>
          <PanelRightClose className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === "roster" ? (
          <RosterPanel
            members={roster}
            focusAgentId={focusAgentId}
            onFocus={onFocusAgent}
          />
        ) : (
          <ol className="flex list-none flex-col gap-3 p-0">
            {activity.length === 0 ? (
              <li className="text-sm text-muted-foreground">开始后将在此查看执行轨迹。</li>
            ) : (
              activity
                .slice(-40)
                .reverse()
                .map((item) => (
                  <li key={item.id} className="relative border-l border-border pl-3 text-xs">
                    <span className="absolute -left-1 top-1 size-2 rounded-full bg-primary" />
                    <p className="font-medium text-foreground">{activityLabel(item)}</p>
                    <p className="mt-1 text-muted-foreground tabular-nums">
                      #{item.sequence} · {item.source} ·{" "}
                      {new Date(item.occurredAt).toLocaleTimeString()}
                    </p>
                    {item.reason ? (
                      <p className="mt-1 text-muted-foreground">{item.reason}</p>
                    ) : null}
                  </li>
                ))
            )}
          </ol>
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-md px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary-soft text-primary-hover"
          : "text-muted-foreground hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
