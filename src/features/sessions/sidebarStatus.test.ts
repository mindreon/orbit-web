import { expect, it } from "vitest";
import { sidebarStatus } from "./sidebarStatus";
it("waiting inbox items take precedence, otherwise only active sessions have a dot", () => {
  expect(sidebarStatus({ id: "s", status: "active" }, [{ sessionId: "s" }])).toBe("waiting");
  expect(sidebarStatus({ id: "s", status: "idle" }, [{ sessionId: "s" }])).toBe("waiting");
  expect(sidebarStatus({ id: "s", status: "active" }, [{ sessionId: "other" }])).toBe("running");
  expect(sidebarStatus({ id: "s", status: "idle" }, [])).toBeNull();
  expect(sidebarStatus({ id: "s", status: "archived" }, [])).toBeNull();
});
