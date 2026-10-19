import type { S } from "../../api/types";
export const decisionChoiceLabels = { allow_once: "允许一次", allow_session: "本会话允许", allow_always: "始终允许", deny: "拒绝", treat_as_done: "视为已完成", retry: "重试", abandon: "放弃" } as const satisfies Record<NonNullable<S["Decision"]["choice"]>, string>;
export const interactionKindLabels = { tool_approval: "工具审批", ask_user: "提问", effect_uncertain: "结果未知的操作" } as const satisfies Record<S["InteractionRequest"]["kind"], string>;
