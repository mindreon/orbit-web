import { useRef } from "react";
/** Same input means the same user intent, even after a failed submission. */
export function useIdempotencyIntent(input: unknown) {
  const fingerprint = JSON.stringify(input);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
  return {
    key: intent.current.key,
    succeeded: () => { intent.current = null; },
  };
}
