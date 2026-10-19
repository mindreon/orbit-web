import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ApiError } from "../../api/errors";
import type { S } from "../../api/types";
import { api } from "../../platform/client";
import { qk } from "../../platform/queryKeys";
import { useIdentity } from "../../platform/identity";
/** The stored JSONB projection may omit schema-defaulted fields until the first task. */
function normalizeTeamView(view: S["TeamView"]): S["TeamView"] {
  return {
    ...view,
    members: view.members ?? [],
    summary: view.summary ?? "",
    board: {
      ...view.board,
      roster: view.board?.roster ?? [],
      tasks: (view.board?.tasks ?? []).map((task) => ({
        ...task,
        deps: task.deps ?? [],
        files: task.files ?? [],
        narrowed_tools: task.narrowed_tools ?? [],
        ...(task.review ? { review: { ...task.review, reviewers: task.review.reviewers ?? [], votes: task.review.votes ?? [] } } : {}),
      })),
    },
  };
}
export function useTeam(runId: string, active = false) {
  const { currentTenant } = useIdentity();
  return useQuery({
    queryKey: qk.team(currentTenant?.id ?? null, runId),
    queryFn: async ({ signal }) => {
      try {
        return normalizeTeamView(await api.get<S["TeamView"]>(`/runs/${runId}/team`, { signal }));
      } catch (error) {
        // Control maps pgx.ErrNoRows to 404 before the team projection is created.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    refetchInterval: (query) => active && query.state.data === null ? 1000 : false,
  });
}
/** Team events only invalidate the authoritative projection; they never build a parallel board. */
export function useTeamSignal(runId: string, signal: number) {
  const { currentTenant } = useIdentity(); const tenant = currentTenant?.id ?? null; const client = useQueryClient();
  const previous = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    previous.current = 0;
    return () => { clearTimeout(pending.current); pending.current = undefined; };
  }, [runId, tenant, client]);
  useEffect(() => {
    if (previous.current === signal) return;
    previous.current = signal;
    if (pending.current !== undefined) return;
    pending.current = setTimeout(() => {
      pending.current = undefined;
      void client.invalidateQueries({ queryKey: qk.team(tenant, runId) });
    }, 1000);
  }, [runId, signal, tenant, client]);
}
