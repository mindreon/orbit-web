import { describe, expect, it } from "vitest";
import { isNoiseArtifact, keyArtifacts, visibleArtifacts, type ArtifactFile } from "./artifacts";

const file = (name: string, mediaType = ""): ArtifactFile => ({ manifestId: "m1", attemptId: "a1", name, mediaType, size: 1 });

describe("isNoiseArtifact", () => {
  it.each([
    "frontend/node_modules/react/index.js",
    "node_modules/.bin/vite",
    "backend/.venv/lib/python3.11/site.py",
    "venv/bin/python",
    "app/__pycache__/main.cpython-311.pyc",
    ".git/HEAD",
    "frontend/dist/index.html",
    "build/out.js",
    ".cache/x",
    ".next/server/app.js",
    "coverage/lcov.info",
    "node-compile-cache/v22.1.0-x64/abc.cache",
    "home/.npm/_cacache/index-v5/aa",
    ".pnpm-store/v3/files/00",
    "frontend/.vite/deps/react.js",
    "lib/python3.11/site-packages/x.py",
    "package-lock.json",
    "frontend/pnpm-lock.yaml",
    "yarn.lock",
    "backend/uv.lock",
  ])("filters %s", (name) => expect(isNoiseArtifact(name)).toBe(true));

  it.each(["README.md", "frontend/src/App.tsx", "docs/build-notes.md", "distribution.txt", ".env.example", "package.json"])("keeps %s", (name) => expect(isNoiseArtifact(name)).toBe(false));
});

describe("visibleArtifacts", () => {
  it("drops noise and keeps only the latest of a name", () => {
    const older = { ...file("a.md"), manifestId: "m0" };
    expect(visibleArtifacts([older, file("a.md"), file("node_modules/x/y.js")])).toEqual([file("a.md")]);
  });
});

describe("keyArtifacts", () => {
  it("puts documents and pages first, hidden files last, at most three", () => {
    const files = [file(".gitignore"), file("src/main.py"), file("README.md"), file("index.html"), file("src/util.py"), file("node_modules/a/b.js")];
    expect(keyArtifacts(files).map((item) => item.name)).toEqual(["README.md", "index.html", "src/main.py"]);
    expect(keyArtifacts(files, 5).map((item) => item.name)).toEqual(["README.md", "index.html", "src/main.py", "src/util.py", ".gitignore"]);
  });

  it("is empty when everything is noise", () => {
    expect(keyArtifacts([file("node_modules/a.js"), file("uv.lock")])).toEqual([]);
  });
});
