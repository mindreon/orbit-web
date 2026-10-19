import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchRunHistory } from "../../api/history";
import { createStreamController, type StreamState } from "../../api/streamController";
import { emptyRunStream, reduceRunEvent } from "../../api/timeline";
import { api } from "../../platform/client";
import { qk } from "../../platform/queryKeys";
export function useRunReplay(runId: string, tenant: string | null, initiallyActive: boolean) {
  const client = useQueryClient(); const [state, setState] = useState(emptyRunStream);
  const [stream, setStream] = useState<StreamState>({ status: "rebuilding" }); const [generation, setGeneration] = useState(0);
  const [wasActive] = useState(initiallyActive);
  useEffect(() => {
    const abort = new AbortController(); let controller: ReturnType<typeof createStreamController> | undefined;
    let latest = emptyRunStream;
    const invalidate = () => { for (const key of [qk.run(tenant, runId), qk.segments(tenant, runId), qk.effects(tenant, runId), qk.runInteractions(tenant, runId), qk.cost(tenant, runId), qk.team(tenant, runId)]) void client.invalidateQueries({ queryKey: key }); };
    async function rebuild() {
      const history = await fetchRunHistory(api, runId, { signal: abort.signal });
      if (abort.signal.aborted) return;
      latest = history.events.reduce(reduceRunEvent, emptyRunStream); setState(latest);
      return history.resumeFrom;
    }
    setState(emptyRunStream); setStream({ status: "rebuilding" });
    void rebuild().then((cursor) => {
      if (abort.signal.aborted) return;
      // Remain connected until the end frame, even if a run.* event invalidates the Run into a terminal state.
      if (!wasActive) { setStream({ status: "ended" }); return; }
      controller = createStreamController({ client: api, target: { runId }, lastEventId: cursor, onState: setStream,
        onCursorExpired: async () => { setState(emptyRunStream); return rebuild(); },
        onEnd: invalidate,
        onEvent: (event) => {
          latest = reduceRunEvent(latest, event); setState(latest);
          if (event.type.startsWith("run.") || event.type === "segment.ended" || event.type.startsWith("interaction.")) invalidate();
        },
      }); controller.start();
    }, (error: unknown) => { if (!abort.signal.aborted) setStream({ status: "fatal", error }); });
    return () => { abort.abort(); controller?.stop(); };
  }, [runId, tenant, generation, client, wasActive]);
  return { state, stream, reconnect: () => setGeneration((value) => value + 1) };
}
