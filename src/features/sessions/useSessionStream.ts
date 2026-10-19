import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Run, Session } from "../../api/types";
import type { RunStreamState } from "../../api/timeline";
import { fetchRunHistory } from "../../api/history";
import { createStreamController, type StreamState } from "../../api/streamController";
import { api } from "../../platform/client";
import { qk } from "../../platform/queryKeys";
import { sessionStreamPlan } from "./sessionStreamPlan";
export function useSessionStream(sessionId: string, tenant: string | null, runs: readonly Run[] | undefined, sessionStatus: Session["status"] | undefined) {
  const client = useQueryClient();
  const [states, setStates] = useState<ReadonlyMap<string, RunStreamState>>(new Map());
  const [stream, setStream] = useState<StreamState>({ status: "connecting" });
  const [generation, setGeneration] = useState(0);
  // Reconstruct only on navigation/reconnect; new run IDs are introduced by SSE, not by restarting the stream.
  const ready = runs !== undefined && sessionStatus !== undefined;
  const archived = sessionStatus === "archived";
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    const plan = sessionStreamPlan((id) => fetchRunHistory(api, id, { signal: abort.signal }));
    let controller: ReturnType<typeof createStreamController> | undefined;
    let ids = (client.getQueryData<{ items: Run[] }>(qk.runs(tenant, sessionId))?.items ?? []).slice(0, 20).map((run) => run.id);
    setStream({ status: "rebuilding" });
    void plan.rebuild(ids).then((cursor) => {
      if (abort.signal.aborted) return;
      setStates(new Map(plan.snapshot()));
      if (archived) return;
      controller = createStreamController({ client: api, target: { sessionId }, lastEventId: cursor, onState: setStream,
        onCursorExpired: async () => { setStates(new Map()); ids = (client.getQueryData<{ items: Run[] }>(qk.runs(tenant, sessionId))?.items ?? []).slice(0, 20).map((run) => run.id); const next = await plan.expired(ids); if (!abort.signal.aborted) setStates(new Map(plan.snapshot())); return next; },
        onEvent: (event) => {
          plan.receive(event); setStates(new Map(plan.snapshot()));
          if (["interaction.requested", "interaction.resolved", "segment.ended"].includes(event.type)) {
            void client.invalidateQueries({ queryKey: qk.runs(tenant, sessionId) });
            void client.invalidateQueries({ queryKey: qk.run(tenant, event.run_id) });
          }
          if (["interaction.requested", "interaction.resolved"].includes(event.type)) {
            void client.invalidateQueries({ queryKey: qk.runInteractions(tenant, event.run_id) });
            void client.invalidateQueries({ queryKey: qk.inbox(tenant) });
          }
          if (event.type.startsWith("artifact.")) void client.invalidateQueries({ queryKey: qk.artifacts(tenant, sessionId) });
          if (event.type.startsWith("run.")) {
            void client.invalidateQueries({ queryKey: qk.team(tenant, event.run_id) });
            void client.invalidateQueries({ queryKey: qk.runs(tenant, sessionId) });
            void client.invalidateQueries({ queryKey: qk.run(tenant, event.run_id) });
            void client.invalidateQueries({ queryKey: qk.messages(tenant, sessionId) });
            void client.invalidateQueries({ queryKey: qk.sessionLists(tenant) });
          }
        },
      }); controller.start();
    }, (error: unknown) => { if (!abort.signal.aborted) setStream({ status: "fatal", error }); });
    return () => { abort.abort(); controller?.stop(); };
  }, [sessionId, tenant, ready, archived, generation, client]);
  return { states, stream, reconnect: () => setGeneration((value) => value + 1) };
}
