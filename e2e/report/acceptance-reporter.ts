/**
 * Playwright reporter that records, per test: the acceptance items it covers (tags `@acc-N`), where it ran, its
 * outcome, and its evidence: `check` attachments (one per verified step, see verify() in e2e/helpers.ts),
 * screenshots, `metrics` (measured numbers) and `environment` (browser versions, see e2e/test.ts).
 * Each Playwright run writes <out>/runs/<run>.json, where <out> is $ACCEPTANCE_OUT (default acceptance-report);
 * e2e/report/build.mjs merges the runs. Test durations are left out: they differ on every run.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Options = { run: string; environment: string };

type Check = { items: number[]; step: string; expected: string; actual: string; pass: boolean };

type Entry = {
  title: string;
  file: string;
  project: string;
  items: number[];
  status: TestResult["status"];
  error?: string;
  checks: Check[];
  screenshots: string[];
  metrics: Record<string, unknown>;
};

const OUT = process.env.ACCEPTANCE_OUT || "acceptance-report";

export default class AcceptanceReporter implements Reporter {
  private entries: Entry[] = [];
  private browsers: Record<string, string> = {};

  constructor(private readonly options: Options) {}

  onTestEnd(test: TestCase, result: TestResult) {
    const items = test.tags.map((tag) => /^@acc-(\d+)$/.exec(tag)?.[1]).filter((id): id is string => Boolean(id)).map(Number);
    if (items.length === 0) return;
    const project = test.parent.project()?.name ?? "";
    const shotDir = join(OUT, "screenshots", this.options.run);
    mkdirSync(shotDir, { recursive: true });
    const screenshots: string[] = [];
    const checks: Check[] = [];
    const metrics: Record<string, unknown> = {};
    for (const attachment of result.attachments) {
      const body = attachment.body?.toString("utf8");
      if (attachment.contentType === "image/png" && attachment.path && attachment.name !== "screenshot") {
        const name = `${slug(test.title)}-${project}-${basename(attachment.name).replace(/[^\w.-]+/g, "_")}.png`;
        copyFileSync(attachment.path, join(shotDir, name));
        screenshots.push(`screenshots/${this.options.run}/${name}`);
      }
      if (!body) continue;
      if (attachment.name === "metrics") Object.assign(metrics, JSON.parse(body));
      if (attachment.name === "check") checks.push(JSON.parse(body));
      if (attachment.name === "environment") Object.assign(this.browsers, JSON.parse(body));
    }
    // Retries: keep only the last attempt.
    this.entries = this.entries.filter((entry) => !(entry.title === test.title && entry.project === project));
    this.entries.push({
      title: test.title,
      file: test.location.file.replace(`${process.cwd()}/`, ""),
      project,
      items,
      status: result.status,
      error: result.error?.message?.split("\n")[0]?.replace(/\u001b\[[0-9;]*m/g, ""),
      checks,
      screenshots,
      metrics,
    });
  }

  onEnd(result: FullResult) {
    mkdirSync(join(OUT, "runs"), { recursive: true });
    const run = { run: this.options.run, environment: this.options.environment, status: result.status, versions: toolchain(), browsers: this.browsers, tests: this.entries };
    writeFileSync(join(OUT, "runs", `${this.options.run}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }

  printsToStdio() {
    return false;
  }
}

const KEY_DEPENDENCIES = ["react", "react-dom", "react-router", "zustand", "@tanstack/react-virtual", "react-markdown", "remark-gfm", "rehype-sanitize", "dompurify", "katex", "mermaid", "lowlight", "vite", "typescript"];

/** Versions of what ran the tests, read where node_modules is installed (the report job has none). */
function toolchain() {
  const installed = (name: string) => {
    try {
      return JSON.parse(readFileSync(join("node_modules", name, "package.json"), "utf8")).version as string;
    } catch {
      return "missing";
    }
  };
  let pnpm = "unavailable";
  try {
    pnpm = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    // not run through pnpm
  }
  return {
    node: process.version,
    pnpm,
    playwright: installed("@playwright/test"),
    dependencies: Object.fromEntries(KEY_DEPENDENCIES.map((name) => [name, installed(name)])),
  };
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "test";
}
