/**
 * Playwright reporter that records, per test: the acceptance items it covers (tags `@acc-N`), where it ran, its
 * outcome, and its evidence (screenshots attached as images, numbers attached as `metrics` JSON).
 * Each Playwright run writes acceptance-report/runs/<run>.json; e2e/report/build.mjs merges the runs.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type Options = { run: string; environment: string };

type Entry = {
  title: string;
  file: string;
  project: string;
  items: number[];
  status: TestResult["status"];
  durationMs: number;
  error?: string;
  screenshots: string[];
  metrics: Record<string, unknown>;
};

const OUT = "acceptance-report";

export default class AcceptanceReporter implements Reporter {
  private entries: Entry[] = [];

  constructor(private readonly options: Options) {}

  onTestEnd(test: TestCase, result: TestResult) {
    const items = test.tags.map((tag) => /^@acc-(\d+)$/.exec(tag)?.[1]).filter((id): id is string => Boolean(id)).map(Number);
    if (items.length === 0) return;
    const project = test.parent.project()?.name ?? "";
    const shotDir = join(OUT, "screenshots", this.options.run);
    mkdirSync(shotDir, { recursive: true });
    const screenshots: string[] = [];
    const metrics: Record<string, unknown> = {};
    for (const attachment of result.attachments) {
      if (attachment.contentType === "image/png" && attachment.path && attachment.name !== "screenshot") {
        const name = `${slug(test.title)}-${project}-${basename(attachment.name).replace(/[^\w.-]+/g, "_")}.png`;
        copyFileSync(attachment.path, join(shotDir, name));
        screenshots.push(`screenshots/${this.options.run}/${name}`);
      }
      if (attachment.name === "metrics" && attachment.body) Object.assign(metrics, JSON.parse(attachment.body.toString("utf8")));
    }
    // Retries: keep only the last attempt.
    this.entries = this.entries.filter((entry) => !(entry.title === test.title && entry.project === project));
    this.entries.push({
      title: test.title,
      file: test.location.file.replace(`${process.cwd()}/`, ""),
      project,
      items,
      status: result.status,
      durationMs: Math.round(result.duration),
      error: result.error?.message?.split("\n")[0],
      screenshots,
      metrics,
    });
  }

  onEnd(result: FullResult) {
    mkdirSync(join(OUT, "runs"), { recursive: true });
    const run = { run: this.options.run, environment: this.options.environment, status: result.status, tests: this.entries };
    writeFileSync(join(OUT, "runs", `${this.options.run}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }

  printsToStdio() {
    return false;
  }
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "test";
}
