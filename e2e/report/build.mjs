#!/usr/bin/env node
/**
 * Merges the Playwright runs in <out>/runs/*.json into the acceptance report. <out> is the first argument, else
 * $ACCEPTANCE_OUT, else acceptance-report.
 *
 *   <out>/report.json        canonical report: commit, versions, scope, and per item id / expected / actual / pass,
 *                            the verified steps (each with its own expected / actual / pass) and screenshots.
 *                            It holds nothing that varies between runs, so two runs of one commit are byte-identical
 *                            (e2e/report/compare.mjs checks that).
 *   <out>/measurements.json  measured numbers (fps, latency, CLS, bundle bytes, ...): the headline values for items
 *                            9, 13 and 16 with their thresholds, plus every raw metric per test.
 *   <out>/items/acc-NN.json  one item of report.json per file.
 *   <out>/index.md           the same as readable tables.
 *
 * Status per item: deferred (out of this PR's scope), pass, fail, not-covered. Exits non-zero on fail, not-covered,
 * a headline threshold miss, or a test whose `@acc-N` tags and verified steps disagree.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || process.env.ACCEPTANCE_OUT || "acceptance-report";
/** Items whose measured numbers the acceptance list asks for. */
const HEADLINE_ITEMS = [9, 13, 16];
const icon = { pass: "✅ pass", fail: "❌ fail", "not-covered": "⚠️ not covered", deferred: "⏭ deferred" };
const acceptance = JSON.parse(readFileSync("e2e/report/acceptance.json", "utf8"));
const runsDir = join(OUT, "runs");
const runs = existsSync(runsDir)
  ? readdirSync(runsDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => JSON.parse(readFileSync(join(runsDir, file), "utf8")))
  : [];
const problems = [];

const commit = git(["rev-parse", "HEAD"]) || process.env.GITHUB_SHA || "";

const stackFile = [join(OUT, "stack.json"), ".stack/stack.json"].find((file) => existsSync(file));
const stackInfo = stackFile && runs.some((run) => run.run === "stack") ? JSON.parse(readFileSync(stackFile, "utf8")) : null;
if (stackInfo && stackInfo.orbitWeb?.ref !== commit) problems.push(`the stack served orbit-web ${stackInfo.orbitWeb?.ref}, not ${commit}: restart it`);
const { orbitWeb: _servedRef, ...stack } = stackInfo ?? {};

const KEY_DEPENDENCIES = ["react", "react-dom", "react-router", "zustand", "@tanstack/react-virtual", "react-markdown", "remark-gfm", "rehype-sanitize", "dompurify", "katex", "mermaid", "lowlight", "vite", "typescript"];
const versions = {
  orbitWeb: commit,
  ...(stackInfo ? { stack } : {}),
  node: process.version,
  pnpm: tool("pnpm", ["--version"]),
  playwright: installed("@playwright/test"),
  browsers: Object.fromEntries(Object.entries(Object.assign({}, ...runs.map((run) => run.browsers ?? {}))).sort()),
  dependencies: Object.fromEntries(KEY_DEPENDENCIES.map((name) => [name, installed(name)])),
};

for (const run of runs) {
  for (const test of run.tests) {
    const checked = new Set(test.checks.flatMap((check) => check.items));
    const tagged = new Set(test.items);
    const untagged = [...checked].filter((id) => !tagged.has(id));
    const unchecked = test.status === "passed" ? [...tagged].filter((id) => !checked.has(id)) : [];
    if (untagged.length) problems.push(`${run.run} › ${test.title}: steps for items ${untagged} without @acc tags`);
    if (unchecked.length) problems.push(`${run.run} › ${test.title}: tagged @acc-${unchecked.join(", @acc-")} but no step verifies it`);
  }
}

const items = acceptance.items.map((item) => {
  const tests = runs.flatMap((run) => run.tests.filter((test) => test.items.includes(item.id)).map((test) => ({ run: run.run, ...test })));
  const steps = tests.flatMap((test) =>
    test.checks
      .filter((check) => check.items.includes(item.id))
      .map((check) => ({ run: test.run, project: test.project, test: test.title, step: check.step, expected: check.expected, actual: check.actual, pass: check.pass })),
  );
  const failedTests = tests.filter((test) => test.status !== "passed" && test.status !== "skipped");
  let status;
  if (item.deferred) status = "deferred";
  else if (failedTests.length > 0 || steps.some((step) => !step.pass)) status = "fail";
  else status = steps.length > 0 ? "pass" : "not-covered";
  const verifiedOn = [...new Set(steps.map((step) => step.run))].sort();
  let actual;
  if (status === "deferred") actual = `不在本 PR 范围：${item.deferred}`;
  else if (status === "not-covered") actual = "没有验证步骤";
  else {
    const passed = steps.filter((step) => step.pass).length;
    actual = `${passed}/${steps.length} 个步骤通过（${verifiedOn.map((run) => `${run} ${steps.filter((step) => step.run === run).length}`).join("，")}）`;
    for (const test of failedTests) actual += `；失败：${test.run} › ${test.title}${test.error ? `：${test.error}` : ""}`;
  }
  return {
    id: item.id,
    group: item.group,
    text: item.text,
    expected: item.text,
    actual,
    pass: status === "pass",
    status,
    ...(item.deferred ? { deferredTo: item.deferred } : {}),
    verifiedOn,
    tests: tests.map((test) => ({ run: test.run, project: test.project, title: test.title, file: test.file, status: test.status, ...(test.error ? { error: test.error } : {}) })),
    steps: steps.map((step, index) => ({ n: index + 1, ...step })),
    screenshots: tests.flatMap((test) => test.screenshots),
    ...(HEADLINE_ITEMS.includes(item.id) ? { measurements: `measurements.json#/items/${item.id}` } : {}),
  };
});

const report = {
  title: acceptance.title,
  commit,
  scope: { inScope: items.filter((item) => !item.deferredTo).map((item) => item.id), deferred: items.filter((item) => item.deferredTo).map((item) => ({ id: item.id, to: item.deferredTo })) },
  versions,
  runs: runs.map((run) => ({ run: run.run, environment: run.environment, status: run.status, tests: run.tests.length, passed: run.tests.filter((test) => test.status === "passed").length })),
  summary: Object.fromEntries(["pass", "fail", "not-covered", "deferred"].map((status) => [status, items.filter((item) => item.status === status).map((item) => item.id)])),
  items,
};

const measurements = buildMeasurements();
for (const id of HEADLINE_ITEMS) {
  const item = measurements.items[id];
  for (const value of item.headline) if (value.pass === false) problems.push(`item ${value.item}: ${value.name} = ${value.value} misses ${value.threshold}`);
  if (item.headline.length === 0) problems.push(`item ${id}: no measured numbers`);
}

mkdirSync(join(OUT, "items"), { recursive: true });
writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(OUT, "measurements.json"), `${JSON.stringify(measurements, null, 2)}\n`);
for (const item of items) writeFileSync(join(OUT, "items", `acc-${String(item.id).padStart(2, "0")}.json`), `${JSON.stringify(item, null, 2)}\n`);
writeFileSync(join(OUT, "index.md"), markdown());

console.log(`acceptance report: ${OUT}/report.json (commit ${commit.slice(0, 12)})`);
for (const item of items) console.log(`  ${String(item.id).padStart(2)} ${icon[item.status].padEnd(16)} ${item.steps.length} steps  ${item.verifiedOn.join(", ")}`);
const bad = items.filter((item) => item.status === "fail" || item.status === "not-covered");
if (bad.length > 0) problems.push(`acceptance items failing or not covered: ${bad.map((item) => item.id).join(", ")}`);
for (const problem of problems) console.error(`  ✗ ${problem}`);
if (problems.length > 0) process.exit(1);

/**
 * Headline numbers per item, looked up by metric path in the tests that cover the item. Each has the threshold
 * the acceptance list sets (null: reported, not gated here; the spec asserts what applies).
 */
function buildMeasurements() {
  const headline = [
    [9, "fixture-perf", "fixture1000Messages50kReply.scrollUp.fps", "1000 条消息 + 5 万字回复，向上滚动", "fps", ">=", 50],
    [9, "fixture-perf", "fixture1000Messages50kReply.scrollDown.fps", "1000 条消息 + 5 万字回复，向下滚动", "fps", ">=", 50],
    [9, "fixture-perf", "fixture1000Messages50kReply.mountedRowsWhileScrolling", "1000 条消息滚动时挂载的行数", "rows", "<", 100],
    [9, "scripted", "mountedRowsOf1000", "1000 条消息打开时挂载的行数", "rows", "<", 60],
    [9, "scripted", "maxCommitsPerFrame", "流式 300 个 delta 时每帧 React 提交次数（最大）", "commits", "<=", 1],
    [9, "stack", "stackPerf.scrollUp.fps", "真实栈 160 条消息 + 5 万字回复，向上滚动", "fps", ">=", 50],
    [9, "stack", "stackPerf.scrollDown.fps", "真实栈 160 条消息 + 5 万字回复，向下滚动", "fps", ">=", 50],
    [9, "fixture-perf", "initialBundle.entryJs.deltaBytes", "首屏 JS 增量（相对 main@e86cd19）", "bytes", null, null],
    [9, "fixture-perf", "initialBundle.entryJs.deltaGzip", "首屏 JS 增量 gzip", "bytes", null, null],
    [9, "fixture-perf", "initialBundle.entryCss.deltaBytes", "首屏 CSS 增量", "bytes", null, null],
    [9, "fixture-perf", "initialBundle.entryCss.deltaGzip", "首屏 CSS 增量 gzip", "bytes", null, null],
    [13, "scripted", "streamingCls.worst", "流式输出（段落、表格、代码、Mermaid）期间 CLS", "", "<=", 0.1],
    [13, "scripted", "smoothScrollIntermediatePositions", "「回到最新」平滑滚动经过的中间位置", "positions", ">=", 3],
    [13, "stack", "stackAutoscroll.streamingCls.cls", "真实栈流式长回复期间 CLS", "", "<=", 0.1],
    [13, "stack", "stackAutoscroll.smoothScrollIntermediatePositions", "真实栈「回到最新」平滑滚动经过的中间位置", "positions", ">=", 3],
    [13, "stack", "stackPerf.streaming.cls", "真实栈流式 5 万字回复期间 CLS", "", "<=", 0.1],
    [13, "fixture-perf", "fixtureStreaming50kReply.cls", "1000 条之上流式 5 万字回复期间 CLS", "", "<=", 0.1],
    [16, "stack", "stackPerf.reply.chars", "真实栈单条回复字符数", "chars", ">=", 50000],
    [16, "stack", "stackPerf.scrollUp.fps", "真实栈 5 万字回复，向上滚动", "fps", ">=", 50],
    [16, "stack", "stackPerf.scrollDown.fps", "真实栈 5 万字回复，向下滚动", "fps", ">=", 50],
    [16, "stack", "stackPerf.typing.nextFrameMax", "真实栈敲字：input 到下一帧（最大）", "ms", "<=", 50],
    [16, "stack", "stackPerf.typing.eventTimingMax", "真实栈敲字：Event Timing（最大，< 16 ms 不记录为 null）", "ms", "<=", 50],
    [16, "fixture-perf", "fixture1000Messages50kReply.scrollUp.fps", "1000 条 + 5 万字回复，向上滚动", "fps", ">=", 50],
    [16, "fixture-perf", "fixture1000Messages50kReply.scrollDown.fps", "1000 条 + 5 万字回复，向下滚动", "fps", ">=", 50],
    [16, "fixture-perf", "fixture1000Messages50kReply.typing.nextFrameMax", "1000 条 + 5 万字回复，敲字：input 到下一帧（最大）", "ms", "<=", 50],
    [16, "fixture-perf", "fixture1000Messages50kReply.typing.eventTimingMax", "1000 条 + 5 万字回复，敲字：Event Timing（最大）", "ms", "<=", 50],
    [16, "fixture-perf", "fixtureStreaming50kReply.typing.nextFrameMax", "流式 5 万字回复期间敲字：input 到下一帧（最大）", "ms", "<=", 50],
  ];
  const byItem = {};
  for (const id of HEADLINE_ITEMS) byItem[id] = { id, text: acceptance.items.find((item) => item.id === id).text, headline: [], raw: [] };
  for (const [id, runName, path, name, unit, op, limit] of headline) {
    const run = runs.find((entry) => entry.run === runName);
    if (!run) continue;
    const test = run.tests.find((entry) => entry.items.includes(id) && lookup(entry.metrics, path) !== undefined);
    if (!test) {
      problems.push(`item ${id}: metric ${runName}:${path} missing`);
      continue;
    }
    const value = lookup(test.metrics, path);
    const pass = op === null ? null : value === null ? true : compare(value, op, limit);
    byItem[id].headline.push({ item: id, name, run: runName, project: test.project, test: test.title, metric: path, value, unit, threshold: op === null ? null : `${op} ${limit}`, pass });
  }
  for (const run of runs) {
    for (const test of run.tests) {
      if (Object.keys(test.metrics).length === 0) continue;
      for (const id of test.items) {
        byItem[id] ??= { id, text: acceptance.items.find((item) => item.id === id).text, headline: [], raw: [] };
        byItem[id].raw.push({ run: run.run, project: test.project, test: test.title, metrics: test.metrics });
      }
    }
  }
  return { commit, note: "Measured values vary between runs; thresholds are the acceptance list's. report.json holds the pass/fail of the same checks.", items: byItem };
}

function lookup(object, path) {
  return path.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), object);
}

function compare(value, op, limit) {
  return { ">=": value >= limit, "<=": value <= limit, "<": value < limit }[op];
}

function markdown() {
  const lines = [
    `# ${acceptance.title}`,
    "",
    `Commit \`${commit}\``,
    "",
    "## Versions",
    "",
    "```json",
    JSON.stringify(versions, null, 2),
    "```",
    "",
    "| Run | Environment | Tests | Passed |",
    "|---|---|---|---|",
    ...report.runs.map((run) => `| ${run.run} | ${run.environment} | ${run.tests} | ${run.passed} |`),
    "",
    "| # | Status | Verified on | Steps | Item |",
    "|---|---|---|---|---|",
    ...items.map((item) => `| ${item.id} | ${icon[item.status]} | ${item.verifiedOn.join(", ") || "—"} | ${item.steps.length} | ${cell(item.text)} |`),
    "",
  ];
  for (const item of items.filter((entry) => entry.steps.length > 0)) {
    lines.push(`## ${item.id}. ${item.group}`, "", `Expected: ${item.expected}`, "", `Actual: ${item.actual}`, "", "| n | Run | Step | Expected | Actual | Pass |", "|---|---|---|---|---|---|");
    for (const step of item.steps) lines.push(`| ${step.n} | ${step.run} (${step.project}) | ${cell(step.step)} | ${cell(step.expected)} | ${cell(step.actual)} | ${step.pass ? "✅" : "❌"} |`);
    const numbers = measurements.items[item.id]?.headline ?? [];
    if (HEADLINE_ITEMS.includes(item.id) && numbers.length) {
      lines.push("", "Measured:", "", "| Measure | Run | Value | Threshold | Pass |", "|---|---|---|---|---|");
      for (const value of numbers) lines.push(`| ${cell(value.name)} | ${value.run} | ${value.value === null ? "—" : `${value.value}${value.unit && value.unit !== "" ? ` ${value.unit}` : ""}`} | ${value.threshold ?? "reported"} | ${value.pass === null ? "—" : value.pass ? "✅" : "❌"} |`);
    }
    if (item.screenshots.length) lines.push("", "Screenshots:", "", ...item.screenshots.map((path) => `- [${path}](${path})`));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function cell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function tool(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

function installed(name) {
  try {
    return JSON.parse(readFileSync(join("node_modules", name, "package.json"), "utf8")).version;
  } catch {
    return "missing";
  }
}
