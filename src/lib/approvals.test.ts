import { describe, expect, it } from "vitest";
import { approvalInfos } from "./approvals";
import type { TaskEvent } from "./tasks";

const requested = (payload: Record<string, unknown>): TaskEvent => ({ seq: 1, event_id: "e1", task_id: "t", type: "approval.requested", source: "workflow", payload, occurred_at: "2026-10-05T00:00:00Z" });

describe("approvalInfos", () => {
  it("tells a profile switch from a tool call, and names its node and target", () => {
    const infos = approvalInfos([
      requested({ approval_id: "apr_1", node_id: "n_1", subject: { kind: "profile_switch", summary: "Switch node n_1 to coder@2: needs a coder", detail: "coder@2", risk: "medium" } }),
      requested({ approval_id: "apr_2", subject: { kind: "tool_call", summary: "Bash", detail: "ls", allow_rule: { tool_name: "Bash", rule_content: "ls:*" } } }),
    ]);
    expect(infos.apr_1).toMatchObject({ kind: "profile_switch", nodeId: "n_1", detail: "coder@2", rule: null });
    expect(infos.apr_2).toMatchObject({ kind: "tool_call", nodeId: "", tool: "Bash", rule: { tool: "Bash", content: "ls:*" } });
  });

  it("reads an event without a kind", () => {
    expect(approvalInfos([requested({ approval_id: "apr_3", subject: { summary: "x" } })]).apr_3?.kind).toBe("");
  });

  it("names the team member that asked, and does not say its role twice (T6)", () => {
    const infos = approvalInfos([
      requested({ approval_id: "apr_4", node_id: "n_1", subject: { kind: "tool_call", summary: "researcher: Bash", detail: "ls", role: "researcher" } }),
      requested({ approval_id: "apr_5", subject: { kind: "tool_call", summary: "Bash", detail: "ls", role: null } }),
      requested({ approval_id: "apr_6", subject: { kind: "tool_call", summary: "researcher：Bash", role: "researcher" } }),
      requested({ approval_id: "apr_7", subject: { kind: "tool_call", summary: "reviewer: Bash", role: "writer" } }),
    ]);
    expect(infos.apr_4).toMatchObject({ role: "researcher", tool: "Bash" });
    expect(infos.apr_5).toMatchObject({ role: "", tool: "Bash" });
    expect(infos.apr_6.tool).toBe("Bash");
    // A summary that starts with another word is left alone.
    expect(infos.apr_7.tool).toBe("reviewer: Bash");
  });
});
