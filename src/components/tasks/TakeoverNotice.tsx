import { Hand } from "lucide-react";
import { Attention } from "../../ui/Attention";
import { Button } from "../../ui/Button";

/** 任务被你接管：AI 不再执行，步骤可以手动完成；交还后 AI 接着做。 */
export function TakeoverNotice({ onHandback }: { readonly onHandback: () => void }) {
  return (
    <Attention aria-label="人工接管" data-testid="takeover-notice" icon={Hand} title="你已接管这个任务">
      <p className="mt-2 text-body text-gray-700">AI 已停止执行。可以在右侧计划里点步骤的「⋯」手动完成它；做完后交还，AI 会从剩下的步骤接着做。</p>
      <div className="mt-3">
        <Button size="sm" variant="primary" data-testid="takeover-handback" onClick={onHandback}>交还</Button>
      </div>
    </Attention>
  );
}
