// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useIdempotencyIntent } from "./useIdempotencyIntent";
afterEach(cleanup);
it("W11 retains the intent key through retries and replaces it on edits and success", () => {
  const hook = renderHook(({ input }) => useIdempotencyIntent(input), { initialProps: { input: "first" } });
  const first = hook.result.current.key;
  hook.rerender({ input: "first" });
  expect(hook.result.current.key).toBe(first);
  hook.rerender({ input: "edited" });
  expect(hook.result.current.key).not.toBe(first);
  const edited = hook.result.current.key;
  act(() => hook.result.current.succeeded());
  hook.rerender({ input: "edited" });
  expect(hook.result.current.key).not.toBe(edited);
});
