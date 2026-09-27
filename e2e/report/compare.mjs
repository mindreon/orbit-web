#!/usr/bin/env node
/**
 * Compares two acceptance reports of the same commit: `node e2e/report/compare.mjs <first> <rerun>`.
 *   - report.json must be byte-identical (it holds no timings, ports or generated ids);
 *   - the headline measurements of items 9, 13 and 16 must meet their thresholds in both runs; they are listed side
 *     by side with the spread between the runs.
 * Writes <first>/rerun-comparison.json and exits non-zero on any difference or threshold miss.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [first = "acceptance-report", rerun = "acceptance-report/rerun"] = process.argv.slice(2);
const read = (dir, file) => readFileSync(join(dir, file));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const reportA = read(first, "report.json");
const reportB = read(rerun, "report.json");
const identical = Buffer.compare(reportA, reportB) === 0;
const differences = identical ? [] : diff(JSON.parse(reportA.toString("utf8")), JSON.parse(reportB.toString("utf8")), "$").slice(0, 50);

const measuresA = JSON.parse(read(first, "measurements.json").toString("utf8"));
const measuresB = JSON.parse(read(rerun, "measurements.json").toString("utf8"));
const measurements = [];
for (const [id, item] of Object.entries(measuresA.items)) {
  if (item.headline.length === 0) continue;
  for (const a of item.headline) {
    const b = measuresB.items[id]?.headline.find((entry) => entry.run === a.run && entry.metric === a.metric);
    const spread = typeof a.value === "number" && typeof b?.value === "number" ? Math.round(Math.abs(a.value - b.value) * 1000) / 1000 : null;
    measurements.push({ item: Number(id), name: a.name, run: a.run, metric: a.metric, unit: a.unit, threshold: a.threshold, first: a.value, rerun: b?.value ?? "missing", spread, pass: a.pass !== false && b !== undefined && b.pass !== false });
  }
}
const thresholdMisses = measurements.filter((entry) => !entry.pass);

const result = {
  commit: { first: measuresA.commit, rerun: measuresB.commit, same: measuresA.commit === measuresB.commit },
  reportJson: { identical, sha256: { first: sha256(reportA), rerun: sha256(reportB) }, differences },
  measurements,
  pass: identical && measuresA.commit === measuresB.commit && thresholdMisses.length === 0,
};
writeFileSync(join(first, "rerun-comparison.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(`rerun comparison (${first} vs ${rerun})`);
console.log(`  commit          ${result.commit.same ? "same" : "DIFFERENT"} ${measuresA.commit.slice(0, 12)}`);
console.log(`  report.json     ${identical ? "byte-identical" : "DIFFERENT"} sha256 ${result.reportJson.sha256.first.slice(0, 16)}`);
for (const difference of differences) console.log(`    ${difference}`);
for (const entry of measurements) {
  console.log(`  #${String(entry.item).padEnd(2)} ${entry.pass ? "ok  " : "FAIL"} ${entry.run.padEnd(12)} ${String(entry.first).padStart(8)} | ${String(entry.rerun).padStart(8)} ${entry.unit.padEnd(9)} ${entry.threshold ?? "reported"}  ${entry.name}`);
}
if (!result.pass) process.exit(1);

function diff(a, b, path) {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((key) => diff(a[key], b[key], `${path}.${key}`));
  }
  return [`${path}: ${JSON.stringify(a)?.slice(0, 160)} ≠ ${JSON.stringify(b)?.slice(0, 160)}`];
}
