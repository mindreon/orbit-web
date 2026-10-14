// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));
beforeEach(() => {
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>diagram</text></svg>' });
});
afterEach(cleanup);

// Failure modes: model HTML/URLs execute, images track readers, diagrams inject SVG,
// invalid/unfinished Mermaid loses source, streaming remounts code and loses interaction state.
describe("Markdown rendering and sanitization", () => {
  it("renders raw HTML as text and removes unsafe URL protocols", () => {
    const { container } = render(<Markdown math={false} text={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29) [data](data:text/html,evil) [safe](https://example.com)'} />);
    expect(container.querySelector("script,img,[onerror]")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    for (const label of ["bad", "data"]) expect(screen.getByText(label).getAttribute("href")).toBeNull();
    const safe = screen.getByText("safe");
    expect(safe.getAttribute("href")).toBe("https://example.com");
    expect(safe.getAttribute("rel")).toContain("noopener");
  });

  it("blocks remote images until the reader opts in", () => {
    const { container } = render(<Markdown math={false} text="![remote](https://example.com/tracking.png)" />);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /加载图片/ }));
    expect(screen.getByAltText("remote").getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("renders GFM tables and inline code as safe structure", () => {
    render(<Markdown math={false} text={'| A | B |\n| --- | --- |\n| `x` | **yes** |'} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("x").tagName).toBe("CODE");
    expect(screen.getByText("yes").tagName).toBe("STRONG");
  });

  it("preserves code block state while streaming and copies raw code", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const source = '```js\nconst value = "<script>";\n```';
    const { rerender } = render(<Markdown text={source} streaming />);
    const block = screen.getByTestId("code-block");
    fireEvent.click(screen.getByRole("button", { name: "自动换行" }));
    rerender(<Markdown text={source + "\n\nnext delta"} streaming />);
    expect(screen.getByTestId("code-block")).toBe(block);
    expect(screen.getByTestId("code-body").getAttribute("data-wrapped")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const value = "<script>";'));
    expect(block.querySelector("script")).toBeNull();
  });

  it("keeps unfinished Mermaid as source and degrades invalid diagrams to code", async () => {
    const { rerender } = render(<Markdown text={'```mermaid\ngraph TD; A-->B'} streaming />);
    expect(screen.getByTestId("code-block").textContent).toContain("生成中");
    expect(mermaid.parse).not.toHaveBeenCalled();
    mermaid.parse.mockRejectedValueOnce(new Error("invalid diagram"));
    rerender(<Markdown text={'```mermaid\ninvalid diagram\n```'} />);
    expect(await screen.findByText(/图无法渲染，显示源码/)).toBeTruthy();
    expect(screen.getByTestId("code-body").textContent).toContain("invalid diagram");
  });

  it("sanitizes Mermaid SVG before inserting it into the DOM", async () => {
    mermaid.render.mockResolvedValueOnce({ svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><text>safe diagram</text></a><foreignObject><img src="x" onerror="alert(1)"></foreignObject></svg>' });
    render(<Markdown text={'```mermaid\ngraph TD; A-->B\n```'} />);
    const diagram = await screen.findByTestId("mermaid");
    expect(diagram.textContent).toContain("safe diagram");
    expect(diagram.querySelector("script,[onload],[onerror],[href^='javascript:']")).toBeNull();
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ securityLevel: "strict", htmlLabels: false }));
  });
});
