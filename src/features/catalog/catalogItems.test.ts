import { expect, it } from "vitest";
import type { Asset } from "../../api/types";
import { catalogItems, conversationLink } from "./catalogItems";
const asset = (id: string, name: string, status = "active") => ({ id, name, status, publisher: "dev", kind: "agent" }) as Asset;
it("U17 unions installs, excludes inactive entries, and sorts installed first then by name", () => {
  const items = catalogItems([asset("a", "alpha"), asset("z", "zeta"), asset("b", "beta"), asset("x", "inactive", "archived")], [{ asset_id: "z" }], [{ asset_id: "b" }]);
  expect(items.map((item) => [item.asset.id, item.installed])).toEqual([["b", true], ["z", true], ["a", false]]);
  expect(conversationLink(items[0].asset)).toBe("/sessions?new=agent:dev/beta");
});
