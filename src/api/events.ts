import type { S } from "./types";

export type EventType = S["EventType"];
export const eventDataSchemas = {
  "run.started": "RunStarted",
  "run.status": "RunStatus",
  "run.completed": "RunCompleted",
  "run.failed": "RunFailed",
  "segment.started": "SegmentStarted",
  "segment.ended": "SegmentEnded",
  "message.delta": "MessageDelta",
  "message.final": "MessageFinal",
  "reasoning.delta": "ReasoningDelta",
  "tool.call": "ToolCall",
  "tool.result": "ToolResult",
  "sandbox.output": "SandboxOutput",
  "artifact.created": "ArtifactCreated",
  "artifact.updated": "ArtifactUpdated",
  "interaction.requested": "InteractionRequested",
  "interaction.resolved": "InteractionResolved",
  "team.task.created": "TeamTaskCreated",
  "team.task.updated": "TeamTaskUpdated",
  "team.member.status": "TeamMemberStatus",
  "team.message": "TeamMessage",
  "usage.update": "UsageUpdate",
  "error": "ErrorData",
  "sandbox.restored": "SandboxRestored"
} as const satisfies Record<EventType, keyof S>;
export type EventDataMap = { [K in EventType]: S[(typeof eventDataSchemas)[K]] };
export type TypedRunEvent = { [K in EventType]: Omit<S["RunEvent"], "type" | "data"> & { type: K; data: EventDataMap[K] } }[EventType];
