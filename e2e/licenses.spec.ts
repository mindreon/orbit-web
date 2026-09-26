/**
 * Licensing (acceptance #10), checked against the installed dependency tree and the source.
 *
 * Ways this can fail (each is asserted below):
 *   L1 a production dependency, or any package this branch adds to the lockfile (direct or transitive), is under a
 *      non-permissive licence (GPL, LGPL, AGPL, EPL, MPL-only, SSPL, BUSL, …).
 *   L2 a direct dependency has no licence the checker can confirm.
 *   L3 code carries a "ported from" header but the repository has no NOTICE entry for it.
 *   L4 anything references a commercially licensed directory (SourceWeft `enterprise/`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { metrics } from "./helpers";

const PERMISSIVE = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Unlicense", "CC0-1.0", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0", "(MPL-2.0 OR Apache-2.0)", "(MIT OR CC0-1.0)"]);
/** Packages whose package.json has no licence field but ship a permissive LICENSE file (checked by hand). */
const KNOWN_UNDECLARED: Record<string, string> = { khroma: "MIT (LICENSE file)" };

type Inventory = Record<string, { name: string; versions: string[] }[]>;

function inventory(prod: boolean): Inventory {
  const args = ["licenses", "list", "--json", ...(prod ? ["--prod"] : [])];
  return JSON.parse(execFileSync("pnpm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

/** Package names in a pnpm v9 lockfile's `packages:` section. */
function lockPackages(text: string): Set<string> {
  const section = text.split(/^packages:\s*$/m)[1]?.split(/^snapshots:\s*$/m)[0] ?? "";
  const names = new Set<string>();
  for (const match of section.matchAll(/^  '?(@?[^@\s']+)@[^:']+'?:\s*$/gm)) names.add(match[1]);
  return names;
}

/** The lockfile of the base branch, to tell packages this branch adds from ones main already had. */
function baseLock(): { ref: string; packages: Set<string> } {
  for (const ref of [process.env.LICENSE_BASE_REF, "origin/main", "e86cd19"].filter(Boolean) as string[]) {
    try {
      return { ref, packages: lockPackages(execFileSync("git", ["show", `${ref}:pnpm-lock.yaml`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })) };
    } catch {
      // try the next ref
    }
  }
  throw new Error("no base lockfile found; fetch main (actions/checkout fetch-depth: 0)");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|css|mjs)$/.test(name) ? [path] : [];
  });
}

test("every dependency is permissively licensed; no ported or commercial code without NOTICE", { tag: ["@acc-10"] }, async () => {
  const all = inventory(false);
  const prod = new Set(Object.values(inventory(true)).flatMap((packages) => packages.map((pkg) => pkg.name)));
  const base = baseLock();
  const current = lockPackages(readFileSync("pnpm-lock.yaml", "utf8"));
  const added = [...current].filter((name) => !base.packages.has(name));
  const offenders: string[] = [];
  const preexisting: string[] = [];
  const counts: Record<string, number> = {};
  for (const [licence, packages] of Object.entries(all)) {
    counts[licence] = packages.length;
    for (const pkg of packages) {
      if (PERMISSIVE.has(licence)) continue;
      if (licence === "Unknown" && KNOWN_UNDECLARED[pkg.name]) continue;
      const label = `${pkg.name}@${pkg.versions.join("/")}: ${licence}`;
      if (prod.has(pkg.name) || !base.packages.has(pkg.name)) offenders.push(label);
      else preexisting.push(label);
    }
  }
  expect(offenders).toEqual([]); // L1

  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const direct = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];
  const licenceOf = new Map<string, string>();
  for (const [licence, packages] of Object.entries(all)) for (const pkg of packages) licenceOf.set(pkg.name, licence);
  const directLicences = Object.fromEntries(direct.map((name) => [name, licenceOf.get(name) ?? "missing"]));
  expect(Object.entries(directLicences).filter(([, licence]) => licence === "missing" || licence === "Unknown")).toEqual([]); // L2

  const files = [...sourceFiles("src"), ...sourceFiles("e2e"), "vite.config.ts"].filter((file) => !file.endsWith("licenses.spec.ts"));
  const ported = files.filter((file) => /ported from|original path:|SPDX-License-Identifier:\s*Apache-2\.0/i.test(readFileSync(file, "utf8")));
  if (ported.length > 0) expect(existsSync("NOTICE")).toBe(true); // L3
  const commercial = files.filter((file) => /sourceweft[^\n]*enterprise\/|from ["'][^"']*enterprise\//i.test(readFileSync(file, "utf8")));
  expect(commercial).toEqual([]); // L4

  await metrics({
    licences: counts,
    directDependencies: directLicences,
    packagesAddedVsBase: { base: base.ref, count: added.length },
    preexistingNonPermissiveDevOnly: preexisting,
    portedFiles: ported,
    notice: existsSync("NOTICE"),
  });
});
