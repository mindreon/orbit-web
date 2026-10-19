// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Select } from "./Select";

afterEach(cleanup);
it("announces both the visible field label and the selected value", () => {
  render(<Select label="组织" value="t1" onValueChange={() => undefined} options={[{ value: "t1", label: "第一组织" }]} />);
  const trigger = screen.getByRole("combobox", { name: "组织 第一组织" });
  const labelId = trigger.getAttribute("aria-labelledby")?.split(" ")[0];
  expect(labelId && document.getElementById(labelId)?.textContent).toBe("组织");
  expect(document.getElementById(labelId!)?.closest("[hidden], .sr-only")).toBeNull();
});
