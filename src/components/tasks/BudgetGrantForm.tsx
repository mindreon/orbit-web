import { useState } from "react";
import type { BudgetAmounts } from "../../lib/taskEvents";
import { emptyGrant, parseGrant, type GrantInput } from "../../lib/usage";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/fields";

interface BudgetGrantFormProps {
  /** 发送追加的额度；成功返回 null，失败返回要给人看的原因。 */
  readonly onGrant: (delta: BudgetAmounts) => Promise<string | null>;
}

const FIELDS: readonly { key: keyof GrantInput; label: string; placeholder: string }[] = [
  { key: "tokens", label: "令牌", placeholder: "例如 5000" },
  { key: "tool_calls", label: "工具调用", placeholder: "例如 20" },
  { key: "wall_s", label: "用时（秒）", placeholder: "例如 600" },
  { key: "cost_usd", label: "费用（美元）", placeholder: "例如 0.5" },
];

/** 「追加预算」：哪项不够就填哪项，空着的不动。追加后任务自己继续。 */
export function BudgetGrantForm({ onGrant }: BudgetGrantFormProps) {
  const [input, setInput] = useState<GrantInput>(emptyGrant);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const parsed = parseGrant(input);
    if (parsed.delta === null) {
      setError(parsed.error);
      return;
    }
    setSending(true);
    setError("");
    const failure = await onGrant(parsed.delta);
    setSending(false);
    if (failure) setError(failure);
    else setInput(emptyGrant);
  };
  return (
    <form
      data-testid="budget-grant-form"
      className="mt-3 rounded-card bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-caption text-muted-foreground">追加预算：哪一项不够就填哪一项，空着的不变。</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <label key={key} className="block text-small">
            <span className="mb-1 block text-small font-medium text-gray-700">{label}</span>
            <Input inputMode="decimal" data-testid={`grant-${key}`} placeholder={placeholder} value={input[key]} onChange={(event) => setInput({ ...input, [key]: event.target.value })} />
          </label>
        ))}
      </div>
      {error ? <p role="alert" data-testid="grant-error" className="mt-2 text-caption text-danger-700">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={sending} data-testid="grant-submit">追加预算</Button>
        <span className="text-caption text-muted-foreground">追加后，被预算拦住的步骤会重新开始。</span>
      </div>
    </form>
  );
}
