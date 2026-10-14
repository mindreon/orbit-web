import { describe, expect, it } from "vitest";
import { extensionOf, findPreviewer, languageOf, PREVIEWERS } from "./registry";
import { urlSource } from "./sources";

/**
 * Ways the pluggable preview registry can fail, each asserted below:
 *   P1 a format is previewed by the wrong renderer (an .svg as an image, a .md as plain code) or by none
 *   P2 an unknown format is rendered as text instead of offering a download
 *   P3 a name without an extension, a dotfile or an upper-case extension is mishandled
 *   P4 the source view of markdown / html / svg gets no highlight language
 *   P5 a file's bytes are fetched from the wrong place, or a failed download is read as content
 */

const id = (name: string, mediaType?: string, assumeText = false) => findPreviewer(name, mediaType, assumeText)?.id ?? null;

describe("findPreviewer (P1, P2)", () => {
  it.each([
    ["diagram.svg", "svg"],
    ["photo.PNG", "image"],
    ["scan.webp", "image"],
    ["README.md", "markdown"],
    ["page.html", "html"],
    ["paper.pdf", "pdf"],
    ["report.docx", "docx"],
    ["sheet.xlsx", "sheet"],
    ["data.csv", "sheet"],
    ["deck.pptx", "pptx"],
    ["main.go", "code"],
    ["config.yaml", "code"],
    ["notes.txt", "text"],
    ["run.log", "text"],
  ])("%s is previewed by %s", (name, expected) => {
    expect(id(name)).toBe(expected);
  });

  it("goes by the media type when the name says nothing", () => {
    expect(id("download", "application/pdf")).toBe("pdf");
    expect(id("blob", "image/png")).toBe("image");
    expect(id("blob", "image/svg+xml")).toBe("svg");
    expect(id("blob", "text/markdown")).toBe("markdown");
    expect(id("blob", "text/plain")).toBe("text");
  });

  it("offers download only for a format it does not know (P2)", () => {
    expect(id("archive.zip")).toBeNull();
    expect(id("model.bin", "application/octet-stream")).toBeNull();
  });

  it("shows an unknown name as text only when the caller already holds text", () => {
    expect(id("SKILL", undefined, true)).toBe("text");
    expect(id("SKILL")).toBeNull();
  });

  it("gives every previewer a distinct id and a loader kind", () => {
    const ids = PREVIEWERS.map((previewer) => previewer.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const previewer of PREVIEWERS) expect(["text", "blob"]).toContain(previewer.load);
  });
});

describe("names (P3, P4)", () => {
  it("reads the extension of the last path segment, lower-cased", () => {
    expect(extensionOf("a/b.d/Report.PDF")).toBe("pdf");
    expect(extensionOf("a.b/Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
  });

  it("picks the highlight language by extension or by well-known base name", () => {
    expect(languageOf("src/app.tsx")).toBe("typescript");
    expect(languageOf("Dockerfile")).toBe("bash");
    expect(languageOf("docs/GUIDE.MD")).toBe("markdown");
    expect(languageOf("index.html")).toBe("xml");
    expect(languageOf("logo.svg")).toBe("xml");
    expect(languageOf("photo.png")).toBe("");
  });
});

describe("urlSource (P5)", () => {
  const stubFetch = (response: Response) => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return response;
    }) as typeof fetch;
    return { calls, restore: () => void (globalThis.fetch = original) };
  };

  it("resolves the signed URL at read time and reads the bytes from it", async () => {
    const { calls, restore } = stubFetch(new Response("hello"));
    try {
      let resolved = 0;
      const source = urlSource({ name: "out/a.txt", size: 5 }, async () => `https://files.example/a?sig=${++resolved}`);
      expect(resolved).toBe(0);
      expect(await source.readText()).toBe("hello");
      expect(calls).toEqual(["https://files.example/a?sig=1"]);
    } finally {
      restore();
    }
  });

  it("fails on an HTTP error instead of showing the error page as the file", async () => {
    const { restore } = stubFetch(new Response("denied", { status: 403 }));
    try {
      await expect(urlSource({ name: "a.txt" }, async () => "https://files.example/a").readBlob()).rejects.toThrow("HTTP 403");
    } finally {
      restore();
    }
  });
});
