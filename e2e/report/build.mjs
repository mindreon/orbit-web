#!/usr/bin/env node
/**
 * Merges the Playwright runs in acceptance-report/runs/*.json into the acceptance report:
 *   acceptance-report/report.json        every item with its status, tests, screenshots and metrics
 *   acceptance-report/items/acc-NN.json  one file per acceptance item
 *   acceptance-report/index.md           the same as a readable table
 * Status per item: deferred (out of this PR's scope), pass (all covering tests passed), fail (any failed),
 * not-covered (no test). Exits non-zero on fail or not-covered, so CI goes red.
 * The report has no timestamps or ports; timings and perf numbers are the only values that vary between runs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "acceptance-report";
const acceptance = JSON.parse(readFileSync("e2e/report/acceptance.json", "utf8"));
const runsDir = join(OUT, "runs");
const runs = existsSync(runsDir)
  ? readdirSync(runsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(readFileSync(join(runsDir, file), "utf8")))
  : [];
const stackFile = [join(OUT, "stack.json"), ".stack/stack.json"].find((file) => existsSync(file));
const stack = stackFile ? JSON.parse(readFileSync(stackFile, "utf8")) : null;

let commit = process.env.GITHUB_SHA ?? "";
try {
  commit ||= execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // not a git checkout
}

const items = acceptance.items.map((item) => {
  const tests = runs.flatMap((run) =>
    run.tests
      .filter((test) => test.items.includes(item.id))
      .map((test) => ({ run: run.run, environment: run.environment, title: test.title, file: test.file, project: test.project, status: test.status, durationMs: test.durationMs, error: test.error, screenshots: test.screenshots, metrics: test.metrics })),
  );
  let status;
  if (item.deferred) status = "deferred";
  else if (tests.length === 0) status = "not-covered";
  else if (tests.some((test) => test.status !== "passed" && test.status !== "skipped")) status = "fail";
  else status = tests.some((test) => test.status === "passed") ? "pass" : "not-covered";
  const metrics = Object.assign({}, ...tests.map((test) => test.metrics));
  return {
    id: item.id,
    group: item.group,
    text: item.text,
    status,
    ...(item.deferred ? { deferredTo: item.deferred } : {}),
    coverage: [...new Set(tests.map((test) => test.run))].sort(),
    tests,
    screenshots: tests.flatMap((test) => test.screenshots),
    metrics,
  };
});

const report = {
  title: acceptance.title,
  commit,
  stack,
  runs: runs.map((run) => ({ run: run.run, environment: run.environment, status: run.status, tests: run.tests.length, passed: run.tests.filter((test) => test.status === "passed").length })),
  summary: Object.fromEntries(["pass", "fail", "not-covered", "deferred"].map((status) => [status, items.filter((item) => item.status === status).map((item) => item.id)])),
  items,
};

mkdirSync(join(OUT, "items"), { recursive: true });
writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const item of items) writeFileSync(join(OUT, "items", `acc-${String(item.id).padStart(2, "0")}.json`), `${JSON.stringify(item, null, 2)}\n`);

const icon = { pass: "✅ pass", fail: "❌ fail", "not-covered": "⚠️ not covered", deferred: "⏭ deferred" };
const lines = [
  `# ${acceptance.title}`,
  "",
  `Commit \`${commit.slice(0, 12)}\`${stack ? ` · stack: orbit-control \`${stack.orbitControl.ref.slice(0, 8)}\`, orbit-runtime \`${stack.orbitRuntime.ref.slice(0, 8)}\`, model mode \`${stack.modelMode}\`` : ""}`,
  "",
  "| Run | Environment | Tests | Passed |",
  "|---|---|---|---|",
  ...report.runs.map((run) => `| ${run.run} | ${run.environment} | ${run.tests} | ${run.passed} |`),
  "",
  "| # | Status | Verified on | Tests | Item |",
  "|---|---|---|---|---|",
  ...items.map((item) => `| ${item.id} | ${icon[item.status]} | ${item.coverage.join(", ") || "—"} | ${item.tests.length} | ${item.text.replace(/\|/g, "\\|")} |`),
  "",
];
for (const item of items.filter((entry) => Object.keys(entry.metrics).length > 0)) {
  lines.push(`## ${item.id}. metrics`, "", "```json", JSON.stringify(item.metrics, null, 2), "```", "");
}
writeFileSync(join(OUT, "index.md"), `${lines.join("\n")}\n`);

console.log(`acceptance report: ${OUT}/report.json`);
for (const item of items) console.log(`  ${String(item.id).padStart(2)} ${icon[item.status].padEnd(16)} ${item.coverage.join(", ")}`);
const bad = items.filter((item) => item.status === "fail" || item.status === "not-covered");
if (bad.length > 0) {
  console.error(`acceptance items failing or not covered: ${bad.map((item) => item.id).join(", ")}`);
  process.exit(1);
}
