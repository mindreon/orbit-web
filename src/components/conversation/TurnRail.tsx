import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "../../lib/cn";
import { COARSE_POINTER, useMediaQuery } from "../../lib/useMediaQuery";
import { prefersReducedMotion } from "../../lib/useBottomFollow";

const MIN_TURNS = 4;
/** 对话区比这窄，轨道会压到正文上，不显示。 */
const MIN_WIDTH_PX = 680;
/** 鼠标所在那一条为 1，往两边依次衰减。 */
const WAVE = [1, 0.7, 0.4, 0.2] as const;
/** 目标在这么多屏之内才平滑滚动，更远的直接跳。 */
const SMOOTH_VIEWPORTS = 1.5;
/** 跳到某一轮时，让这条消息离顶部留一点空。 */
const TOP_GAP_PX = 16;

interface RailTurn {
  readonly user: string;
  readonly reply: string;
}

interface Scan {
  readonly turns: readonly RailTurn[];
  /** 每一轮包含的元素（用户消息和它的回复），用来判断这一轮在不在视野里。 */
  readonly elements: readonly (readonly HTMLElement[])[];
}

const squash = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const SETTLED = new Set(["completed", "failed", "cancelled"]);

/**
 * 从对话列里读出「轮」：一条用户消息加上它后面直到下一条用户消息之间的回复。只有回复已经结束的轮才算（正在写的那一轮不上轨道）。
 * 单 Agent 的回复是 agent-message，专家团的群聊是 chat-bubble；两种都靠 DOM 里的 testid 找，用户消息一律是 user-message。
 */
function scan(column: HTMLElement): Scan {
  const turns: RailTurn[] = [];
  const elements: HTMLElement[][] = [];
  let user: HTMLElement | null = null;
  let replies: HTMLElement[] = [];
  const close = () => {
    if (!user || replies.length === 0) return;
    const unsettled = replies.some((el) => (el.dataset.testid === "agent-message" ? !SETTLED.has(el.dataset.status ?? "") : el.dataset.live === "true" || el.dataset.status === "running"));
    if (unsettled) return;
    const answers = replies.flatMap((el) => {
      const text = el.dataset.testid === "agent-message" ? el.querySelector('[data-testid="final-output"]') : el.querySelector('[data-testid="chat-text"]');
      return text ? [squash(text.textContent)] : [];
    });
    turns.push({ user: squash(user.querySelector('[data-testid="user-text"]')?.textContent), reply: [...answers].reverse().find((text) => text !== "") ?? "" });
    elements.push([user, ...replies]);
  };
  for (const el of column.querySelectorAll<HTMLElement>('[data-testid="user-message"], [data-testid="agent-message"], [data-testid="chat-bubble"]')) {
    if (el.dataset.testid === "user-message") {
      close();
      user = el;
      replies = [];
    } else if (user) {
      replies.push(el);
    }
  }
  close();
  return { turns, elements };
}

const sameElements = (a: readonly (readonly HTMLElement[])[], b: readonly (readonly HTMLElement[])[]) => a.length === b.length && a.every((group, i) => group.length === b[i].length && group.every((el, j) => el === b[i][j]));

/**
 * 对话左侧的轮次导航：每一轮一道短横线，视野里的几轮更深；鼠标靠近时横线按距离拉长，悬停或聚焦出一张卡片
 * （你说的话一行、回复最多三行），点一下滚到那一轮。至少 4 轮才出现；对话区太窄、或触屏上不显示。
 */
export function TurnRail({ scroller, column }: { scroller: RefObject<HTMLElement | null>; column: RefObject<HTMLElement | null> }) {
  const touch = useMediaQuery(COARSE_POINTER);
  const [wide, setWide] = useState(true);
  const [turns, setTurns] = useState<readonly RailTurn[]>([]);
  // 轮对应的 DOM 元素换了（比如换了任务）才要重新观察视野。
  const [generation, setGeneration] = useState(0);
  const scanned = useRef<Scan>({ turns: [], elements: [] });
  const [visible, setVisible] = useState<ReadonlySet<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const [tipTop, setTipTop] = useState<number | null>(null);
  const enabled = !touch && wide;

  // 宽度：对话区自己的宽度，不是窗口的。
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWide(el.clientWidth >= MIN_WIDTH_PX));
    observer.observe(el);
    return () => observer.disconnect();
  }, [scroller]);

  // 内容一变（流式文字、回复结束）就合并到下一帧重读一次；内容没变就不动状态。
  useEffect(() => {
    const col = column.current;
    if (!col || !enabled) return;
    let frame: number | null = null;
    const read = () => {
      frame = null;
      const next = scan(col);
      setGeneration((count) => (sameElements(scanned.current.elements, next.elements) ? count : count + 1));
      scanned.current = next;
      setTurns((current) => (current.length === next.turns.length && current.every((turn, i) => turn.user === next.turns[i].user && turn.reply === next.turns[i].reply) ? current : next.turns));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(read);
    };
    read();
    const mutation = new MutationObserver(schedule);
    mutation.observe(col, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-status", "data-live"] });
    return () => {
      mutation.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [column, enabled]);

  const shown = enabled && turns.length >= MIN_TURNS;

  // 哪几轮在视野里（用户消息或它的回复有一部分露在滚动区里）。
  useEffect(() => {
    const el = scroller.current;
    if (!shown || !el || typeof IntersectionObserver === "undefined") return;
    const owner = new Map<Element, number>();
    scanned.current.elements.forEach((group, index) => group.forEach((node) => owner.set(node, index)));
    const inView = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target);
          else inView.delete(entry.target);
        }
        const next = new Set<number>();
        inView.forEach((node) => next.add(owner.get(node)!));
        setVisible((current) => (current.size === next.size && [...next].every((index) => current.has(index)) ? current : next));
      },
      { root: el, threshold: 0 },
    );
    owner.forEach((_, node) => observer.observe(node));
    return () => observer.disconnect();
  }, [scroller, shown, generation]);

  // 轨道比一屏高时它自己会滚：让视野里的那几条留在轨道的可见范围内。
  useEffect(() => {
    const box = list.current;
    const first = Math.min(...visible);
    const row = rows.current[first];
    if (!box || !row || visible.size === 0) return;
    if (row.offsetTop < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop - box.clientHeight / 2;
  }, [visible]);

  const preview = hover ?? focus;
  const item = preview === null ? undefined : turns[preview];

  // 卡片跟着那一条横线，竖直方向夹在轨道容器里。
  const place = useCallback(() => {
    const row = preview === null ? null : rows.current[preview];
    const box = root.current;
    if (!row || !box) return setTipTop(null);
    const height = tooltip.current?.offsetHeight ?? 0;
    const center = row.getBoundingClientRect().top + row.offsetHeight / 2 - box.getBoundingClientRect().top;
    setTipTop(Math.min(Math.max(center - height / 2, 0), Math.max(0, box.clientHeight - height)));
  }, [preview]);
  useLayoutEffect(place, [place, item]);

  if (!shown) return null;

  const jump = (index: number) => {
    const el = scroller.current;
    const target = scanned.current.elements[index]?.[0];
    if (!el || !target) return;
    const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top - TOP_GAP_PX;
    const behavior = !prefersReducedMotion() && Math.abs(delta) <= el.clientHeight * SMOOTH_VIEWPORTS ? "smooth" : "instant";
    el.scrollTo({ top: Math.max(0, el.scrollTop + delta), behavior });
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-y-0 left-1 z-10 flex items-center">
      <nav aria-label="轮次导航" data-testid="turn-rail" className="pointer-events-auto flex max-h-[min(70%,640px)] min-h-0 flex-col">
        <div
          ref={list}
          onScroll={place}
          className="flex min-h-0 flex-col overflow-x-hidden overflow-y-auto py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: "linear-gradient(to bottom, transparent, black 18px, black calc(100% - 18px), transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 18px, black calc(100% - 18px), transparent)" }}
        >
          {turns.map((turn, index) => {
            const distance = preview === null ? -1 : Math.abs(index - preview);
            const wave = distance >= 0 && distance < WAVE.length ? WAVE[distance] : 0;
            const inView = visible.has(index);
            const label = turn.user.length > 60 ? `${turn.user.slice(0, 60)}…` : turn.user;
            return (
              <button
                key={index}
                ref={(node) => {
                  rows.current[index] = node;
                }}
                type="button"
                data-testid="turn-rail-bar"
                data-visible={inView ? "true" : undefined}
                aria-label={`第 ${index + 1} 轮：${label}`}
                aria-current={inView ? "location" : undefined}
                aria-describedby={preview === index ? "turn-rail-tip" : undefined}
                className="group flex h-2.5 min-h-[10px] w-[30px] shrink-0 items-center rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover((current) => (current === index ? null : current))}
                onFocus={() => setFocus(index)}
                onBlur={() => setFocus((current) => (current === index ? null : current))}
                onClick={() => jump(index)}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-0.5 w-[26px] origin-left rounded-full transition-[transform,background-color] duration-150 group-hover:bg-gray-900 group-focus-visible:bg-gray-900 motion-reduce:transition-none", inView ? "bg-gray-700" : "bg-gray-300")}
                  style={{ transform: `scaleX(${0.2308 + 0.7692 * wave})` }}
                />
              </button>
            );
          })}
        </div>
      </nav>
      {item ? (
        <div
          ref={tooltip}
          id="turn-rail-tip"
          role="tooltip"
          data-testid="turn-rail-tooltip"
          className="pointer-events-none absolute left-9 w-80 max-w-[calc(100vw-3rem)] space-y-1 rounded-card border border-border bg-card px-3 py-2.5 shadow-lg"
          style={{ top: tipTop ?? 0, visibility: tipTop === null ? "hidden" : "visible" }}
        >
          <p data-testid="turn-rail-user" className="truncate text-small font-medium text-foreground">
            {item.user}
          </p>
          {item.reply !== "" ? (
            <p data-testid="turn-rail-reply" className="line-clamp-3 break-words text-small text-muted-foreground">
              {item.reply}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
