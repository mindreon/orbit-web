import { useEffect, useState } from "react";
import type { AgentQuestion as Question, AskQuestion } from "../../lib/taskEvents";
import { Check, MessageCircleQuestion } from "lucide-react";
import { cn } from "../../lib/cn";
import { Attention } from "../../ui/Attention";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/fields";
import { RichText } from "../markdown/RichText";

interface AgentQuestionProps {
  readonly question: Question;
  readonly onAnswer: (text: string) => Promise<void>;
}

/** What the user picked for one question: indices into its options, and what they typed themselves. */
interface Answer {
  readonly picked: readonly number[];
  readonly custom: string;
}

const NONE: Answer = { picked: [], custom: "" };

/** The labels the user chose for a question plus their own text, or "" when it is unanswered. */
function answerOf(question: AskQuestion, answer: Answer): string {
  const parts = answer.picked.map((index) => question.options[index]?.label ?? "").filter(Boolean);
  if (answer.custom.trim()) parts.push(answer.custom.trim());
  return parts.join("、");
}

/** The one message the answers go out as: `1. 公司名称：迈能` per line, "未回答" for a question left alone. */
export function formatAnswers(questions: readonly AskQuestion[], answers: readonly Answer[]): string {
  return questions.map((q, index) => `${index + 1}. ${q.header || q.question}：${answerOf(q, answers[index] ?? NONE) || "未回答"}`).join("\n");
}

/** The attempt is parked on ask_user; a message answers it and the same attempt continues. */
export function AgentQuestion({ question, onAnswer }: AgentQuestionProps) {
  return (
    <Attention aria-label="Agent 提问" icon={MessageCircleQuestion} title="Agent 向你提问">
      {question.questions && question.questions.length > 0 ? (
        <Structured lead={question.text} questions={question.questions} onAnswer={onAnswer} />
      ) : (
        <Plain text={question.text} onAnswer={onAnswer} />
      )}
    </Attention>
  );
}

/** No options: the question as markdown and a free-text reply. */
function Plain({ text, onAnswer }: { text: string; onAnswer: (text: string) => Promise<void> }) {
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
      <div data-testid="agent-question" className="mt-1 text-body text-foreground">
        <RichText text={text} />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          value={reply}
          rows={2}
          disabled={sending}
          placeholder="回复 Agent（Enter 发送，Shift+Enter 换行）"
          className="min-w-0 flex-1 resize-none"
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" disabled={sending} onClick={() => void send()}>回复</Button>
      </div>
    </>
  );
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function Structured({ lead, questions, onAnswer }: { lead: string; questions: readonly AskQuestion[]; onAnswer: (text: string) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<readonly Answer[]>(() => questions.map(() => NONE));
  const [sending, setSending] = useState(false);
  const last = questions.length - 1;
  // The text after the first line repeats the questions below.
  const leadLine = (lead.split("\n")[0] ?? "").trim();
  const current = questions[step] as AskQuestion;
  const answer = answers[step] ?? NONE;
  const answered = (index: number) => answerOf(questions[index] as AskQuestion, answers[index] ?? NONE) !== "";
  const change = (index: number, next: Answer) => setAnswers((all) => all.map((item, i) => (i === index ? next : item)));

  const pick = (option: number) => {
    if (sending) return;
    if (current.multiSelect) {
      change(step, { ...answer, picked: answer.picked.includes(option) ? answer.picked.filter((i) => i !== option) : [...answer.picked, option] });
      return;
    }
    change(step, { picked: [option], custom: "" });
    if (step < last) setStep(step + 1);
  };
  const type = (text: string) => change(step, { picked: current.multiSelect ? answer.picked : [], custom: text });
  const submit = async () => {
    if (sending || !questions.some((_, index) => answered(index))) return;
    setSending(true);
    try {
      await onAnswer(formatAnswers(questions, answers));
      setAnswers(questions.map(() => NONE));
      setStep(0);
    } finally {
      setSending(false);
    }
  };
  const advance = () => (step < last ? setStep(step + 1) : void submit());

  // Number keys pick an option while focus is not in a text field.
  useEffect(() => {
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
      {leadLine ? <p data-testid="agent-question" className="mt-1 text-body text-foreground">{leadLine}</p> : null}
      <ol aria-label="问题" className="mt-2 flex flex-wrap gap-1.5">
        {questions.map((q, index) => (
          <li key={index}>
            <button
              type="button"
              aria-current={index === step ? "step" : undefined}
              className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium", index === step ? "bg-primary-600 text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border hover:bg-secondary")}
              onClick={() => setStep(index)}
            >
              {answered(index) ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
              {index + 1} {q.header}
            </button>
          </li>
        ))}
      </ol>
      <p data-testid="agent-question-text" className="mt-3 whitespace-pre-wrap text-body font-medium text-foreground">{current.question}</p>
      <div role={current.multiSelect ? "group" : "radiogroup"} aria-label={current.header || `问题 ${step + 1}`} className="mt-2 space-y-1.5">
        {current.options.map((option, index) => {
          const on = answer.picked.includes(index);
          return (
            <button
              key={index}
              type="button"
              role={current.multiSelect ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={sending}
              className={cn("flex w-full items-start gap-2 rounded-control px-3 py-2 text-left text-body ring-1", on ? "bg-primary-100 text-foreground ring-primary-500" : "bg-card text-foreground ring-border hover:bg-secondary")}
              onClick={() => pick(index)}
            >
              <Mark on={on} square={current.multiSelect} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{option.label}</span>
                {option.description ? <span className="block text-small text-muted-foreground">{option.description}</span> : null}
              </span>
              {index < 4 ? <kbd className="shrink-0 text-caption text-muted-foreground">{index + 1}</kbd> : null}
            </button>
          );
        })}
        <div className={cn("flex items-center gap-2 rounded-control px-3 py-2 ring-1", answer.custom.trim() ? "bg-primary-100 ring-primary-500" : "bg-card ring-border")}>
          <Mark on={answer.custom.trim() !== ""} square={current.multiSelect} />
          <span className="shrink-0 text-body font-medium text-foreground">{current.options.length === 0 ? "你的回答" : "其他（自己填写）"}</span>
          <Input
            value={answer.custom}
            disabled={sending}
            aria-label="自己填写"
            placeholder="输入你的答案"
            className="min-w-0 flex-1"
            onChange={(e) => type(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                advance();
              }
            }}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-small text-muted-foreground">{answered(step) ? "" : "未回答"}</span>
        <span className="flex-1" />
        <Button disabled={step === 0 || sending} onClick={() => setStep(step - 1)}>上一题</Button>
        {step < last ? (
          <Button disabled={sending} onClick={() => setStep(step + 1)}>下一题</Button>
        ) : (
          <Button variant="primary" disabled={sending || !questions.some((_, index) => answered(index))} onClick={() => void submit()}>提交</Button>
        )}
      </div>
    </div>
  );
}

/** The radio or checkbox dot in front of a row. */
function Mark({ on, square }: { on: boolean; square: boolean }) {
  return (
    <span aria-hidden="true" className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ring-1", square ? "rounded-control" : "rounded-full", on ? "bg-primary-600 text-primary-foreground ring-primary-600" : "bg-card ring-border")}>
      {on ? <Check className="h-3 w-3" /> : null}
    </span>
  );
}
