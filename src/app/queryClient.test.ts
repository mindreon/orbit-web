import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "../api/errors";
import { createQueryClient, retryDelay, shouldRetry } from "./queryClient";

/**
 * Ways the query defaults can fail, each asserted below:
 *   Q1 a refusal that can never succeed (404, validation) is retried, or a transient failure is not
 *   Q2 retries never stop
 *   Q3 a failed write is retried on its own, or fails without the user hearing about it
 */

const api = (status: number, retryable: boolean) => new ApiError(status, { code: "X", message: "m", retryable });

describe("shouldRetry (Q1, Q2)", () => {
  it("retries what the server marks retryable, and network failures", () => {
    expect(shouldRetry(0, api(503, true))).toBe(true);
    expect(shouldRetry(0, new NetworkError(null))).toBe(true);
  });

  it("does not retry what would fail the same way again", () => {
    expect(shouldRetry(0, api(404, false))).toBe(false);
    expect(shouldRetry(0, api(422, false))).toBe(false);
    expect(shouldRetry(0, new TypeError("a bug"))).toBe(false);
  });

  it("gives up after three retries", () => {
    expect([0, 1, 2, 3, 4].map((count) => shouldRetry(count, api(503, true)))).toEqual([true, true, true, false, false]);
  });

  it("backs off between tries, within a cap", () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 10_000]);
  });
});

describe("createQueryClient (Q3)", () => {
  it("uses the retry policy for queries and none for mutations", () => {
    const defaults = createQueryClient(() => undefined).getDefaultOptions();
    expect(defaults.queries?.retry).toBe(shouldRetry);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it("reports a failed mutation once, without retrying it", async () => {
    const onError = vi.fn();
    const client = createQueryClient(onError);
    const failure = api(503, true);
    const mutationFn = vi.fn(() => Promise.reject(failure));
    await new MutationObserver(client, { mutationFn }).mutate().catch(() => undefined);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(failure);
  });
});
