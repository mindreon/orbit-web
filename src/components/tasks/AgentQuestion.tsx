import { useEffect, useState } from "react";
import type { AgentQuestion as Question, AskQuestion } from "../../lib/taskEvents";
import { Check, ChevronLeft, ChevronRight, MessageCircleQuestion, Minus, Pencil } from "lucide-react";
import { cn } from "../../lib/cn";
import { isTyping, useImeGuard } from "../../lib/keys";
import { RichText } from "../markdown/RichText";
import { DockCard, type QueueNav } from "./DockCard";

interface AgentQuestionProps {
  readonly question: Question;
  readonly onAnswer: (text: string) => Promise<void>;
  /** 排在最前、正显示着；数字键只在这时生效。 */
  readonly active?: boolean;
  readonly nav?: QueueNav | null;
  /** 收起成输入框上方的一粒小胶囊；回答写到一半的内容留着。 */
  readonly onMinimize: () => void;
}

/** What the user picked for one question: indices into its options, what they typed themselves, or that they skipped it. */
interface Answer {
  readonly picked: readonly number[];
  readonly custom: string;
  readonly skipped?: boolean;
}

const NONE: Answer = { picked: [], custom: "" };

/** The labels the user chose for a question plus their own text, or "" when it is unanswered. */
function answerOf(question: AskQuestion, answer: Answer): string {
  const parts = answer.picked.map((index) => question.options[index]?.label ?? "").filter(Boolean);
  if (answer.custom.trim()) parts.push(answer.custom.trim());
  return parts.join("、");
}

/** The one message the answers go out as: `1. 公司名称：迈能` per line, "未回答" for a question left alone (or skipped). */
export function formatAnswers(questions: readonly AskQuestion[], answers: readonly Answer[]): string {
  return questions.map((q, index) => `${index + 1}. ${q.header || q.question}：${answerOf(q, answers[index] ?? NONE) || "未回答"}`).join("\n");
}

const PRIMARY = "flex h-8 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40";

/** The attempt is parked on ask_user; a message answers it and the same attempt continues. */
export function AgentQuestion({ question, onAnswer, active = true, nav = null, onMinimize }: AgentQuestionProps) {
  return (
    <DockCard
      icon={MessageCircleQuestion}
      label="交互"
      nav={nav}
      active={active}
      aria-label="Agent 提问"
      data-testid="question-card"
      actions={
        <button type="button" aria-label="收起提问，稍后回答" title="收起，稍后回答" data-testid="question-minimize" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-gray-600 hover:bg-warning-100" onClick={onMinimize}>
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
      }
    >
      {question.questions && question.questions.length > 0 ? (
        <Structured lead={question.text} questions={question.questions} active={active} onAnswer={onAnswer} />
      ) : (
        <Plain text={question.text} onAnswer={onAnswer} />
      )}
    </DockCard>
  );
}

/** No options: the question as markdown and a free-text reply. */
function Plain({ text, onAnswer }: { text: string; onAnswer: (text: string) => Promise<void> }) {
  const ime = useImeGuard();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await onAnswer(reply.trim());
      setReply("");
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <div data-testid="agent-question" className="mt-2 max-h-48 overflow-y-auto text-body text-foreground">
        <RichText text={text} />
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-control bg-card py-1 pl-2 pr-1 ring-1 ring-border focus-within:ring-primary-500">
        <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={reply}
          disabled={sending}
          aria-label="回复 Agent"
          placeholder="回复 Agent（Enter 发送）"
          className="h-7 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(e) => setReply(e.target.value)}
          onCompositionEnd={ime.onCompositionEnd}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !ime.isImeKey(event)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" disabled={sending || !reply.trim()} className={PRIMARY} onClick={() => void send()}>
          回复
        </button>
      </div>
    </>
  );
}

function Structured({ lead, questions, active, onAnswer }: { lead: string; questions: readonly AskQuestion[]; active: boolean; onAnswer: (text: string) => Promise<void> }) {
  const ime = useImeGuard();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<readonly Answer[]>(() => questions.map(() => NONE));
  const [sending, setSending] = useState(false);
  const count = questions.length;
  // The text after the first line repeats the questions below.
  const leadLine = (lead.split("\n")[0] ?? "").trim();
  const current = questions[step] as AskQuestion;
  const answer = answers[step] ?? NONE;
  const answered = (index: number) => answerOf(questions[index] as AskQuestion, answers[index] ?? NONE) !== "";
  const resolved = (index: number) => answered(index) || answers[index]?.skipped === true;
  const change = (index: number, next: Answer) => setAnswers((all) => all.map((item, i) => (i === index ? next : item)));
  const allResolved = questions.every((_, index) => resolved(index));
  const anyAnswered = questions.some((_, index) => answered(index));
  /** The next question still waiting after `from`, wrapping round; `from` itself never counts. */
  const nextOpen = (from: number): number | null => {
    for (let offset = 1; offset < count; offset += 1) {
      const index = (from + offset) % count;
      if (!resolved(index)) return index;
    }
    return null;
  };

  const pick = (option: number) => {
    if (sending) return;
    if (current.multiSelect) {
      change(step, { picked: answer.picked.includes(option) ? answer.picked.filter((i) => i !== option) : [...answer.picked, option], custom: answer.custom });
      return;
    }
    change(step, { picked: [option], custom: "" });
    const next = nextOpen(step);
    if (next !== null) setStep(next);
  };
  const type = (text: string) => change(step, { picked: current.multiSelect ? answer.picked : [], custom: text });
  const skip = () => {
    if (sending) return;
    change(step, { ...NONE, skipped: true });
    const next = nextOpen(step);
    if (next !== null) setStep(next);
  };
  const submit = async () => {
    if (sending || !anyAnswered) return;
    setSending(true);
    try {
      await onAnswer(formatAnswers(questions, answers));
      setAnswers(questions.map(() => NONE));
      setStep(0);
    } finally {
      setSending(false);
    }
  };
  // 下一项 until every question is answered or skipped; then 提交.
  const next = allResolved ? null : nextOpen(step);
  const canAdvance = !sending && (allResolved ? anyAnswered : next !== null);
  const advance = () => {
    if (!canAdvance) return;
    if (allResolved) void submit();
    else if (next !== null) setStep(next);
  };

  // Number keys pick an option while focus is not in a text field.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < current.options.length) {
        event.preventDefault();
        pick(index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div data-testid="agent-question-form">
      {leadLine ? (
        <p data-testid="agent-question" className="mt-2 text-small text-muted-foreground">
          {leadLine}
        </p>
      ) : null}
      <div className="mt-1 max-h-[45vh] overflow-y-auto">
        <p data-testid="agent-question-text" className="whitespace-pre-wrap break-words text-body font-semibold text-foreground">
          {current.question}
        </p>
        <div role={current.multiSelect ? "group" : "radiogroup"} aria-label={current.header || `问题 ${step + 1}`} className="mt-2 space-y-0.5">
          {current.options.map((option, index) => {
            const on = answer.picked.includes(index);
            return (
              <button
                key={index}
                type="button"
                role={current.multiSelect ? "checkbox" : "radio"}
                aria-checked={on}
                disabled={sending}
                className="group flex min-h-8 w-full items-start gap-2 rounded-control px-2 py-1 text-left text-body text-foreground hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60"
                onClick={() => pick(index)}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-caption font-medium group-hover:border-foreground group-hover:bg-foreground group-hover:text-background",
                    on ? "border-foreground bg-foreground text-background" : "border-gray-300 text-gray-600",
                  )}
                >
                  {on ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{option.label}</span>
                  {option.description ? <span className="block break-words text-small text-muted-foreground">{option.description}</span> : null}
                </span>
              </button>
            );
          })}
          <div className={cn("flex min-h-8 items-center gap-2 rounded-control bg-card px-2 ring-1 focus-within:ring-primary-500", answer.custom.trim() ? "ring-primary-500" : "ring-border")}>
            <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={answer.custom}
              disabled={sending}
              aria-label="自定义回答"
              placeholder={current.options.length === 0 ? "输入你的回答" : "自定义回答"}
              className="h-7 min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(e) => type(e.target.value)}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !ime.isImeKey(event)) {
                  event.preventDefault();
                  advance();
                }
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {count > 1 ? (
          <span className="flex shrink-0 items-center text-caption font-medium text-gray-600">
            <button type="button" aria-label="上一题" disabled={sending} className="flex h-6 w-6 items-center justify-center rounded-control hover:bg-warning-100" onClick={() => setStep((step + count - 1) % count)}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <span data-testid="question-counter" className="min-w-9 text-center tabular-nums">
              {step + 1}/{count}
            </span>
            <button type="button" aria-label="下一题" disabled={sending} className="flex h-6 w-6 items-center justify-center rounded-control hover:bg-warning-100" onClick={() => setStep((step + 1) % count)}>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-small text-muted-foreground">{answers[step]?.skipped ? "已跳过" : answered(step) ? "" : "未回答"}</span>
        <button type="button" disabled={sending} className="h-8 shrink-0 rounded-full px-3 text-small font-medium text-gray-700 hover:bg-warning-100 disabled:opacity-40" onClick={skip}>
          跳过
        </button>
        <button type="button" data-testid="question-primary" disabled={!canAdvance} className={PRIMARY} onClick={advance}>
          {allResolved ? "提交" : "下一项"}
        </button>
      </div>
    </div>
  );
}
