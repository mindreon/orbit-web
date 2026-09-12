"use client";

import { Tag } from "@/components/ui/tag";
import type { RosterMember } from "@/lib/rooms-ui";
import { cn } from "@/lib/utils";

type Props = {
  members: RosterMember[];
  focusAgentId: string | null;
  onFocus: (id: string | null) => void;
};

export function RosterPanel({ members, focusAgentId, onFocus }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        只观察：可过滤时间线，不能对单个子 Agent 暂停/取消。改派请对房间说话或使用「调整方向」。
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {members.map((member) => {
          const selected = focusAgentId === member.id;
          return (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => onFocus(selected ? null : member.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-background hover:bg-surface-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{member.name}</p>
                  <Tag
                    color={
                      member.status === "running"
                        ? "processing"
                        : member.status === "done"
                          ? "success"
                          : "default"
                    }
                  >
                    {member.status === "running"
                      ? "运行中"
                      : member.status === "done"
                        ? "完成"
                        : "空闲"}
                  </Tag>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {member.role === "lead" ? "主 Agent" : "子 Agent"} · Persona{" "}
                  {member.personaName}
                  {member.inherited ? "（继承主人格）" : "（自定义覆盖）"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      {focusAgentId ? (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onFocus(null)}
        >
          清除成员过滤
        </button>
      ) : null}
    </div>
  );
}
