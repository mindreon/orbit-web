import type { TeamStageView } from "../../lib/taskEvents";
import { teamProgressText } from "../../lib/team";

/**
 * 「团队协作」: where one team stage is against its limits. What the members said, and did, is told in the chat; this is
 * only the summary line: the round, the messages used, and how long a chain of @-wakes may get.
 */
export function TeamStagePanel({ stage }: { readonly stage: TeamStageView }) {
  return (
    <p data-testid="team-stage" data-node-id={stage.nodeId} className="mt-3 rounded-control bg-muted px-3 py-2 text-small text-gray-700">
      <span className="font-medium">团队协作</span>
      <span data-testid="team-progress" className="ml-2 text-muted-foreground">{teamProgressText(stage)}</span>
    </p>
  );
}
