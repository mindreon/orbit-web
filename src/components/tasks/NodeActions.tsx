import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { nodeTitle, profileName } from "../../lib/display";
import { singleExperts, type Expert } from "../../lib/experts";
import type { Plan } from "../../lib/tasks";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Input, Select, Textarea } from "../../ui/fields";

type PlanNode = Plan["nodes"][number];

/** 节点菜单要用到的：任务现在的状态、能选的专家、两个操作。操作成功返回 null，失败返回要给人看的原因。 */
export interface NodeActions {
  readonly taskStatus: string;
  readonly experts: readonly Expert[];
  readonly onComplete: (nodeId: string, reason: string) => Promise<string | null>;
  readonly onSwitch: (nodeId: string, toProfile: string, reason: string) => Promise<string | null>;
}

const DONE = ["COMPLETED", "SKIPPED", "CANCELLED"];

/** 接管期间，没有在执行的步骤可以由人手动完成。 */
export const canCompleteByHand = (node: PlanNode, taskStatus: string): boolean =>
  taskStatus === "TAKEN_OVER" && !node.frozen && !DONE.includes(node.status) && !["RUNNING", "VERIFYING"].includes(node.status);

/** 由 agent 执行的、还没完成的步骤可以换专家。 */
export const canSwitchProfile = (node: PlanNode, taskStatus: string): boolean =>
  ["agent_turn", "sop_stage"].includes(node.type) && !node.frozen && !DONE.includes(node.status) && taskStatus !== "CANCELLED";

type Open = "complete" | "switch" | null;

/** 一个步骤右上角的「⋯」菜单。 */
export function NodeMenu({ node, actions }: { readonly node: PlanNode; readonly actions: NodeActions }) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const complete = canCompleteByHand(node, actions.taskStatus);
  const swap = canSwitchProfile(node, actions.taskStatus);
  if (!complete && !swap) return null;
  const choose = (next: Open) => {
    setMenu(false);
    setOpen(next);
  };
  return (
    <span className="relative">
      <button type="button" aria-label={`步骤操作：${nodeTitle(node.title)}`} data-testid="node-menu" aria-haspopup="menu" aria-expanded={menu} className="flex h-6 w-6 items-center justify-center rounded-control text-gray-500 hover:bg-gray-100" onClick={() => setMenu((value) => !value)}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div role="menu" className="absolute right-0 top-7 z-20 min-w-32 rounded-card bg-card p-1 shadow-lg ring-1 ring-border">
            {complete ? (
              <button type="button" role="menuitem" data-testid="node-action-complete" className="flex w-full items-center rounded-control px-3 py-2 text-left text-body hover:bg-secondary" onClick={() => choose("complete")}>
                手动完成
              </button>
            ) : null}
            {swap ? (
              <button type="button" role="menuitem" data-testid="node-action-switch" className="flex w-full items-center rounded-control px-3 py-2 text-left text-body hover:bg-secondary" onClick={() => choose("switch")}>
                切换专家
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {open === "complete" ? <CompleteDialog node={node} onClose={() => setOpen(null)} onSubmit={(reason) => actions.onComplete(node.node_id, reason)} /> : null}
      {open === "switch" ? <SwitchDialog node={node} experts={actions.experts} onClose={() => setOpen(null)} onSubmit={(toProfile, reason) => actions.onSwitch(node.node_id, toProfile, reason)} /> : null}
    </span>
  );
}

function useSubmit(onClose: () => void) {
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const run = async (task: () => Promise<string | null>) => {
    setSending(true);
    setError("");
    const failure = await task();
    setSending(false);
    if (failure) setError(failure);
    else onClose();
  };
  return { error, sending, run };
}

function CompleteDialog({ node, onClose, onSubmit }: { node: PlanNode; onClose: () => void; onSubmit: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState("");
  const { error, sending, run } = useSubmit(onClose);
  return (
    <Dialog title="手动完成这个步骤" onClose={onClose}>
      <p className="text-body text-gray-700">「{nodeTitle(node.title)}」会直接记为已完成，不再校验，之后不能改动。这是你自己的判断，请写下原因。</p>
      <Textarea aria-label="完成原因" data-testid="node-action-reason" rows={3} className="mt-3" placeholder="例如：文件我已经自己改好了" value={reason} onChange={(event) => setReason(event.target.value)} />
      {error ? <p role="alert" data-testid="node-action-error" className="mt-2 text-body text-danger-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" data-testid="node-action-submit" disabled={sending || reason.trim() === ""} onClick={() => void run(() => onSubmit(reason.trim()))}>确认完成</Button>
      </div>
    </Dialog>
  );
}

function SwitchDialog({ node, experts, onClose, onSubmit }: { node: PlanNode; experts: readonly Expert[]; onClose: () => void; onSubmit: (toProfile: string, reason: string) => Promise<string | null> }) {
  // A team has no agent to run (control refuses it as a node's profile): only single experts can take a step over.
  const choices = singleExperts(experts).filter((expert) => expert.ref !== node.owner_profile);
  const [target, setTarget] = useState(choices[0]?.ref ?? "");
  const [reason, setReason] = useState("手动切换");
  const { error, sending, run } = useSubmit(onClose);
  return (
    <Dialog title="切换专家" onClose={onClose}>
      <p className="text-body text-gray-700">「{nodeTitle(node.title)}」现在由 {profileName(node.owner_profile, experts)} 执行。换成下面的专家后，从下一次执行起生效；正在执行的这一次不受影响。</p>
      {choices.length === 0 ? (
        <p className="mt-3 text-body text-muted-foreground">没有其他专家可选。先去「专家」里新建一位。</p>
      ) : (
        <>
          <label className="mt-3 block text-body">
            <span className="mb-1 block text-small font-medium text-gray-700">换成</span>
            <Select className="w-full" aria-label="目标专家" data-testid="switch-expert" value={target} onChange={(event) => setTarget(event.target.value)}>
              {choices.map((expert) => (
                <option key={expert.ref} value={expert.ref}>
                  {expert.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="mt-3 block text-body">
            <span className="mb-1 block text-small font-medium text-gray-700">原因</span>
            <Input aria-label="切换原因" data-testid="switch-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <p className="mt-2 text-caption text-muted-foreground">不在这个任务专家范围内的，会先请你批准。</p>
        </>
      )}
      {error ? <p role="alert" data-testid="node-action-error" className="mt-2 text-body text-danger-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" data-testid="node-action-submit" disabled={sending || target === "" || reason.trim() === ""} onClick={() => void run(() => onSubmit(target, reason.trim()))}>切换</Button>
      </div>
    </Dialog>
  );
}
