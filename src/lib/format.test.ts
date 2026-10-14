import { describe, expect, it } from "vitest";
import { formatSize } from "./format";

describe("formatSize", () => {
  it("scales to B, KB and MB", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("says nothing for a size that cannot be right", () => {
    expect(formatSize(-1)).toBe("");
    expect(formatSize(Number.NaN)).toBe("");
    expect(formatSize(Number.POSITIVE_INFINITY)).toBe("");
  });
});
