// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
afterEach(cleanup);
it("preserves Dialog API, accessible name and escape/close behavior through Radix", () => {
  const onClose = vi.fn();
  render(<Dialog title="确认操作" onClose={onClose}><button>内容按钮</button></Dialog>);
  expect(screen.getByRole("dialog", { name: "确认操作" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭" }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
