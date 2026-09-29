import { useState } from "react";
import type { AgentQuestion as Question } from "../../lib/taskEvents";

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
    <section aria-label="Agent 提问" className="border-t border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800">Agent 向你提问</p>
      <p data-testid="agent-question" className="mt-1 text-sm text-amber-900">{question.text}</p>
      <div className="mt-2 flex gap-2">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="回复 Agent" className="min-w-0 flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void send()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white">回复</button>
      </div>
    </section>
  );
}
