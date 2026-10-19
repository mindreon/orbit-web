import type { TypedRunEvent } from "../../api/events";
import { emptyRunStream, reduceRunEvent, type RunStreamState } from "../../api/timeline";
interface History { events: TypedRunEvent[]; resumeFrom?: string }
/** History loads in batches of four. The feature owns rebuilding; the stream controller owns connection lifetime. */
export function sessionStreamPlan(history: (id: string) => Promise<History>) {
  let runs = new Map<string, RunStreamState>();
  let consecutiveExpiries = 0;
  async function rebuild(ids: readonly string[]) {
    const next = new Map<string, RunStreamState>();
    const cursors: string[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(ids.slice(i, i + 4).map(async (id) => {
        const result = await history(id);
        next.set(id, result.events.reduce(reduceRunEvent, emptyRunStream));
        if (result.resumeFrom) cursors.push(result.resumeFrom);
      }));
    }
    runs = next;
    return cursors.sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)[0];
  }
  return {
    rebuild,
    async expired(ids: readonly string[]) { if (++consecutiveExpiries > 1) throw new Error("游标连续过期，请刷新"); return rebuild(ids); },
    receive(event: TypedRunEvent) { consecutiveExpiries = 0; runs = new Map(runs).set(event.run_id, reduceRunEvent(runs.get(event.run_id) ?? emptyRunStream, event)); },
    snapshot: () => runs,
  };
}
