// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePreview } from "./FilePreview";
import { PREVIEWERS } from "./registry";
import type { FileSource } from "./types";

// jsdom has no PDF canvas/worker or Office layout. Keep real registry/modules/shell;
// replace only the SDK boundary, and exercise successful mounting plus SDK refusal.
const sdk = vi.hoisted(() => ({ docx: vi.fn(), pptx: vi.fn(), pdf: vi.fn(), destroy: vi.fn() }));
vi.mock("docx-preview", () => ({ renderAsync: (...args: unknown[]) => sdk.docx(...args) }));
vi.mock("pptx-preview", () => ({ init: (host: HTMLElement) => ({ preview: (buffer: ArrayBuffer) => sdk.pptx(host, buffer), destroy: sdk.destroy }) }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: (...args: unknown[]) => ({ promise: sdk.pdf(...args), destroy: sdk.destroy }) }));

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  sdk.docx.mockReset().mockImplementation(async (_blob: Blob, host: HTMLElement) => { host.textContent = "document rendered"; });
  sdk.pptx.mockReset().mockImplementation(async (host: HTMLElement) => { host.textContent = "slides rendered"; });
  sdk.pdf.mockReset().mockResolvedValue({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 100, height: 100 }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }) }) });
  sdk.destroy.mockClear();
});
afterEach(cleanup);

const cases = [
  ["svg", "drawing.svg", '<svg xmlns="http://www.w3.org/2000/svg"><text>svg</text></svg>'],
  ["image", "photo.png", "bytes"], ["markdown", "readme.md", "# Preview heading"],
  ["html", "page.html", "<h1>isolated</h1><script>window.evil=1</script>"],
  ["pdf", "report.pdf", "bytes"], ["docx", "report.docx", "bytes"],
  ["sheet", "data.csv", "name,value\ncell,42"], ["pptx", "slides.pptx", "bytes"],
  ["code", "example.ts", "const answer = 42;"], ["text", "notes.txt", "plain text"],
] as const;
function source(name: string, text: string): FileSource { return { name, readText: vi.fn(async () => text), readBlob: vi.fn(async () => new Blob([text])), download: vi.fn() }; }

describe("preview registry rendering", () => {
  it("covers every registered previewer", () => { expect(cases.map(([id]) => id)).toEqual(PREVIEWERS.map(({ id }) => id)); });
  it.each(cases)("mounts %s via the real lazy registry", async (id, name, text) => {
    const file = source(name, text);
    const { container, unmount } = render(<FilePreview source={file} />);
    expect(screen.getByTestId("file-preview").getAttribute("data-previewer")).toBe(id);
    if (id === "svg" || id === "image") {
      expect((await screen.findByAltText(name)).getAttribute("src")).toBe("blob:preview");
    } else if (id === "markdown") expect(await screen.findByRole("heading", { name: "Preview heading" })).toBeTruthy();
    else if (id === "html") {
      await waitFor(() => expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts"));
      expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe(text);
      expect(container.querySelector("script")).toBeNull();
    } else if (id === "pdf") expect((await screen.findByTestId("pdf-page")).textContent).toBe("1 / 1");
    else if (id === "docx") expect(await screen.findByText("document rendered")).toBeTruthy();
    else if (id === "pptx") expect(await screen.findByText("slides rendered")).toBeTruthy();
    else if (id === "sheet") expect(await screen.findByRole("cell", { name: "42" })).toBeTruthy();
    else if (id === "code") expect((await screen.findByTestId("code-preview")).textContent).toBe(text);
    else expect(await screen.findByText(text)).toBeTruthy();
    expect(id === "svg" || id === "markdown" || id === "html" || id === "code" || id === "text" ? file.readText : file.readBlob).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    expect(file.download).toHaveBeenCalledOnce();
    unmount();
    if (id === "svg" || id === "image") expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    if (id === "pdf" || id === "pptx") expect(sdk.destroy).toHaveBeenCalled();
  });

  it.each(["pdf", "docx", "pptx"] as const)("shows a download fallback when the %s SDK fails", async (id) => {
    sdk[id].mockRejectedValueOnce(new Error("invalid file"));
    render(<FilePreview source={source(`bad.${id}`, "bad")} />);
    expect(await screen.findByText(/无法打开，请下载查看/)).toBeTruthy();
  });

  it("switches a rendered format to source", async () => {
    render(<FilePreview source={source("readme.md", "# Heading")} />);
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "源码" }));
    expect((await screen.findByTestId("code-preview")).textContent).toBe("# Heading");
  });

  it("does not read unsupported or oversized files", async () => {
    const file = source("large.txt", "not loaded");
    render(<FilePreview source={{ ...file, size: 3 * 1024 * 1024 }} />);
    await waitFor(() => expect(screen.getByTestId("preview-fallback")).toBeTruthy());
    expect(file.readText).not.toHaveBeenCalled();
  });
});
