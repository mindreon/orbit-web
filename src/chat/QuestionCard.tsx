import { memo } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { cn } from "../lib/cn";
import type { QuestionCardView } from "../lib/events/timeline";

/** Shown where the question was asked. There is no answer endpoint yet, so the card is read-only. */
export const QuestionCard = memo(function QuestionCard({ card }: { card: QuestionCardView }) {
  const picked = new Set(card.answer?.choiceIds ?? []);
  return (
    <div data-testid="question-card" data-state={card.answer ? "answered" : "open"} className={cn("max-w-2xl rounded-lg border px-3 py-2.5 text-sm", card.answer ? "border-[#ececee] bg-[#fafafb]" : "border-primary/30 bg-primary/5")}>
      <div className="flex items-center gap-2 text-xs">
        <MessageCircleQuestion className="text-primary h-4 w-4" aria-hidden />
        <span className="font-semibold text-[#222]">{card.answer ? "助手问过你" : "助手在问你"}</span>
        {card.agentPath && card.agentPath !== "main" ? <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#666]">子助手 · {card.agentPath}</span> : null}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap leading-6 text-[#222]">{card.text}</p>
      {card.choices.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.choices.map((choice) => (
            <span key={choice.id} className={cn("rounded-full border px-2.5 py-0.5 text-xs", picked.has(choice.id) ? "border-primary bg-white text-primary" : "border-[#e3e5e8] bg-white text-[#666]")}>
              {choice.label}
            </span>
          ))}
        </div>
      ) : null}
      {card.answer ? (
        card.answer.text ? <p className="mt-2 text-xs text-[#555]">你的回答：{card.answer.text}</p> : null
      ) : (
        <p className="mt-2 text-[11px] text-[#b0b0b0]">回答入口 · 未接入</p>
      )}
    </div>
  );
});
