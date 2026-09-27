import { flushSync } from "react-dom";

/**
 * One commit per animation frame. Stream updates, list re-measurements and lazy-module loads queue here;
 * the frame callback runs them inside a single flushSync so React renders them together, once.
 */
const queue = new Set<() => void>();
let handle: number | null = null;

function run() {
  handle = null;
  const tasks = [...queue];
  queue.clear();
  flushSync(() => {
    for (const task of tasks) task();
  });
}

export function scheduleFrame(task: () => void) {
  queue.add(task);
  if (handle === null) handle = requestAnimationFrame(run);
}
