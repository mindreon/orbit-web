#!/usr/bin/env node
/**
 * Secret scan of the acceptance report directory: `node e2e/report/scan.mjs [dir]` (default acceptance-report).
 *
 * Every text file (json, md) is searched for
 *   - values the E2E setup plants on purpose: the stack's internal token (e2e/stack/up.mjs) and the credential-shaped
 *     string inside a turn.failed message (e2e/cards.spec.ts);
 *   - the value of every environment variable whose name looks secret (TOKEN, SECRET, PASSWORD, KEY, ...);
 *   - credential patterns: AWS access keys, GitHub tokens, sk- API keys, Slack tokens, Google API keys, private key
 *     blocks, JWTs, bearer tokens.
 * Then gitleaks (pinned in CI) scans the whole directory, screenshots included, if it is on PATH or $GITLEAKS;
 * with REQUIRE_GITLEAKS=1 a missing gitleaks is an error.
 * Writes <dir>/secret-scan.json (matches redacted) and <dir>/gitleaks.json; exits non-zero on any finding.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const DIR = process.argv[2] || process.env.ACCEPTANCE_OUT || "acceptance-report";
const OUTPUTS = new Set(["secret-scan.json", "gitleaks.json"]);

const planted = [
  ["stack internal token", /const TOKEN = "([^"]+)"/.exec(readFileSync("e2e/stack/up.mjs", "utf8"))?.[1]],
  ["planted key in turn.failed", /const PLANTED_KEY = "([^"]+)"/.exec(readFileSync("e2e/cards.spec.ts", "utf8"))?.[1]],
];
for (const [name, value] of planted) if (!value) throw new Error(`could not read the planted value "${name}"`);

const envSecrets = Object.entries(process.env)
  .filter(([name, value]) => /TOKEN|SECRET|PASSW|API_?KEY|PRIVATE|CREDENTIAL|AUTH/i.test(name) && value && value.length >= 8)
  .map(([name, value]) => [`env ${name}`, value]);

const patterns = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ["github-fine-grained-pat", /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],
  ["sk-api-key", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/g],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["private-key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g],
];

const files = walk(DIR);
const textFiles = files.filter((file) => [".json", ".md", ".txt", ".html"].includes(extname(file)) && !OUTPUTS.has(basename(file)));
const findings = [];
for (const file of textFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const [rule, value] of [...planted, ...envSecrets]) if (line.includes(value)) findings.push({ file: relative(DIR, file), line: index + 1, rule, match: redact(value) });
    for (const [rule, pattern] of patterns) for (const match of line.matchAll(pattern)) findings.push({ file: relative(DIR, file), line: index + 1, rule, match: redact(match[0]) });
  });
}

const gitleaks = runGitleaks();
const result = {
  dir: DIR,
  scanned: { textFiles: textFiles.length, images: files.filter((file) => extname(file) === ".png").length },
  rules: { planted: planted.map(([name]) => name), environment: envSecrets.map(([name]) => name), patterns: patterns.map(([name]) => name) },
  findings,
  gitleaks,
  pass: findings.length === 0 && gitleaks.pass,
};
writeFileSync(join(DIR, "secret-scan.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(`secret scan of ${DIR}: ${textFiles.length} text files, ${result.scanned.images} images; ${planted.length} planted values, ${envSecrets.length} env secrets, ${patterns.length} patterns`);
for (const finding of findings) console.error(`  ✗ ${finding.file}:${finding.line} ${finding.rule} ${finding.match}`);
console.log(`  gitleaks: ${gitleaks.version ?? "not run"} ${gitleaks.pass ? "clean" : `FAILED (${gitleaks.reason ?? `${gitleaks.findings} findings`})`}`);
if (!result.pass) process.exit(1);

function runGitleaks() {
  const bin = process.env.GITLEAKS || "gitleaks";
  const version = spawnSync(bin, ["version"], { encoding: "utf8" });
  if (version.error) return process.env.REQUIRE_GITLEAKS === "1" ? { pass: false, reason: `${bin} not found` } : { pass: true, skipped: `${bin} not found` };
  const report = join(DIR, "gitleaks.json");
  const scan = spawnSync(bin, ["dir", DIR, "--redact", "--no-banner", "--report-format", "json", "--report-path", report, "--exit-code", "3"], { encoding: "utf8" });
  const leaks = existsSync(report) ? JSON.parse(readFileSync(report, "utf8") || "[]") : [];
  if (scan.status !== 0 && scan.status !== 3) return { version: version.stdout.trim(), pass: false, reason: `exit ${scan.status}: ${scan.stderr.trim().split("\n").pop()}` };
  return { version: version.stdout.trim(), pass: leaks.length === 0, findings: leaks.length, leaks: leaks.map((leak) => ({ file: relative(DIR, leak.File), line: leak.StartLine, rule: leak.RuleID })) };
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function redact(value) {
  return `${value.slice(0, 4)}…(${value.length} chars)`;
}
