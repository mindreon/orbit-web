import { useMemo } from "react";
import type { Segment, Step } from "../../lib/conversation";
import { ActivityTimeline } from "./ActivityTimeline";

/**
 * The steps of a member's work or of a bubble in the team chat, as the same activity rows an agent reply has (one line per call,
 * consecutive reads/searches/commands folded into one). They come without the words of each model round, so there is nothing to
 * interleave: see `AgentMessage` for a reply with its narration.
 */
export function StepList({ steps, active }: { steps: readonly Step[]; active: boolean }) {
  const segments = useMemo((): readonly Segment[] => steps.map((step) => ({ kind: "step", step })), [steps]);
  return <ActivityTimeline segments={segments} active={active} />;
}
