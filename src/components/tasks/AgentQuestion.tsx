import { useState } from "react";
import type { AgentQuestion as Question } from "../../lib/taskEvents";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/fields";

interface AgentQuestionProps {
  readonly question: Question;
  readonly onAnswer: (text: string) => Promise<void>;
}

/** The attempt is parked on ask_user; a message answers it and the same attempt continues. */
export function AgentQuestion({ question, onAnswer }: AgentQuestionProps) {
  const [answer, setAnswer] = useState("");
  const send = async () => {
    if (!answer.trim()) return;
    await onAnswer(answer.trim());
    setAnswer("");
  };
  return (
    <section aria-label="Agent 提问" className="rounded-xl border border-warning/30 bg-warning/10 p-4">
      <p className="text-xs font-semibold text-warning">Agent 向你提问</p>
      <p data-testid="agent-question" className="mt-1 text-sm text-foreground">{question.text}</p>
      <div className="mt-2 flex gap-2">
        <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="回复 Agent" className="min-w-0 flex-1" />
        <Button variant="primary" onClick={() => void send()}>回复</Button>
      </div>
    </section>
  );
}
