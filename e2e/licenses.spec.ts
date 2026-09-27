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
import { metrics, verify } from "./helpers";
import { expect, test } from "./test";

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
  await verify([10], "`pnpm licenses list` 列出全部依赖；和基线分支的 pnpm-lock.yaml 比出本分支新增的包（含传递依赖）", "生产依赖和本分支新增的包全部是宽松许可证（MIT / ISC / Apache-2.0 / BSD 等）", async () => {
    expect(offenders).toEqual([]); // L1
    return `非宽松许可的生产依赖或新增包：${offenders.length} 个；main 上已有的仅开发用非宽松包：${JSON.stringify(preexisting)}`;
  });

  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const direct = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];
  const licenceOf = new Map<string, string>();
  for (const [licence, packages] of Object.entries(all)) for (const pkg of packages) licenceOf.set(pkg.name, licence);
  const directLicences = Object.fromEntries(direct.map((name) => [name, licenceOf.get(name) ?? "missing"]));
  await verify([10], "逐个查 package.json 里直接依赖的许可证", "每个直接依赖都有可确认的许可证", async () => {
    expect(Object.entries(directLicences).filter(([, licence]) => licence === "missing" || licence === "Unknown")).toEqual([]); // L2
    return Object.entries(directLicences).map(([name, licence]) => `${name}: ${licence}`).join("；");
  });

  const files = [...sourceFiles("src"), ...sourceFiles("e2e"), "vite.config.ts"].filter((file) => !file.endsWith("licenses.spec.ts"));
  const ported = files.filter((file) => /ported from|original path:|SPDX-License-Identifier:\s*Apache-2\.0/i.test(readFileSync(file, "utf8")));
  const commercial = files.filter((file) => /sourceweft[^\n]*enterprise\/|from ["'][^"']*enterprise\//i.test(readFileSync(file, "utf8")));
  await verify([10], "扫描 src/、e2e/ 和 vite.config.ts 的源码头注释和引用路径", "搬来的代码（ported from / 原路径 / Apache 许可头）都有 NOTICE；没有引用任何商业许可目录（SourceWeft enterprise/）", async () => {
    if (ported.length > 0) expect(existsSync("NOTICE")).toBe(true); // L3
    expect(commercial).toEqual([]); // L4
    return `带搬运许可头的文件 ${JSON.stringify(ported)}，NOTICE ${existsSync("NOTICE") ? "存在" : "不存在"}；引用商业目录的文件 ${commercial.length} 个`;
  });

  await metrics({
    licences: counts,
    directDependencies: directLicences,
    packagesAddedVsBase: { base: base.ref, count: added.length },
    preexistingNonPermissiveDevOnly: preexisting,
    portedFiles: ported,
    notice: existsSync("NOTICE"),
  });
});
