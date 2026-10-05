import { describe, expect, it } from "vitest";
import { cn } from "./cn";

/** Failure first: `text-caption` followed by a colour class used to vanish, turning 12px badges into 16px text. */
describe("cn", () => {
  it("keeps a design-system font size next to a text colour", () => {
    expect(cn("text-caption font-medium", "bg-gray-100 text-gray-700")).toBe("text-caption font-medium bg-gray-100 text-gray-700");
    expect(cn("text-small", "text-primary-700")).toBe("text-small text-primary-700");
  });
  it("still lets a later size override an earlier one", () => {
    expect(cn("text-body", "text-small")).toBe("text-small");
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
  });
  it("still lets a later colour override an earlier one", () => {
    expect(cn("text-gray-500", "text-danger-700")).toBe("text-danger-700");
  });
});
