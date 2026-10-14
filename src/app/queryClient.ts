import { MutationCache, QueryClient } from "@tanstack/react-query";
import { isRetryable } from "../api/errors";

const MAX_RETRIES = 3;

/** Retry only what the server (or the network) says can succeed later: a 404 or a validation error would fail the same way again. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

export const retryDelay = (failureCount: number): number => Math.min(1000 * 2 ** failureCount, 10_000);

/** `onMutationError` is where a failed write is shown to the user (the global toast); queries show their own failure in place. */
export function createQueryClient(onMutationError: (error: unknown) => void): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({ onError: onMutationError }),
    defaultOptions: {
      queries: { retry: shouldRetry, retryDelay, refetchOnWindowFocus: false },
      // A write is retried by the person, with the same intent; blind retries would repeat it under a new Idempotency-Key.
      mutations: { retry: false },
    },
  });
}
