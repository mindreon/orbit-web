import { expect, it } from "vitest";
import { journeyMarker } from "../e2e/helpers";

it("journey markers match the testmcp notify_send text marker extractor", () => {
  const markerPattern = /\bj[0-9a-z]*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  for (const journey of [1, 3]) {
    const marker = journeyMarker(journey);
    expect(`deploy ${marker}`.match(markerPattern)?.[0]).toBe(marker);
  }
});
