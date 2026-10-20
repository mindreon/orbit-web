export type FileChange = { path: string; status: "added" | "removed" | "changed" };
export function fileDiff(before: readonly { path: string; sha256: string }[], after: readonly { path: string; sha256: string }[]): FileChange[] {
  const old = new Map(before.map((f) => [f.path, f.sha256])); const next = new Map(after.map((f) => [f.path, f.sha256]));
  return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap<FileChange>((path) => !old.has(path) ? [{ path, status: "added" as const }] : !next.has(path) ? [{ path, status: "removed" as const }] : old.get(path) !== next.get(path) ? [{ path, status: "changed" as const }] : []);
}
export type DiffLine = { kind: "add" | "remove" | "context"; text: string; old?: number; next?: number };
export type DiffChunk = DiffLine | { kind: "fold"; lines: DiffLine[] };
/** Bounded LCS; large files fall back to a replacement rather than quadratic allocation. */
export function unifiedDiff(before: string, after: string, context = 3): DiffChunk[] {
  const a = before ? before.split("\n") : []; const b = after ? after.split("\n") : [];
  let prefix = 0; while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0; while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const x = a.slice(prefix, a.length - suffix); const y = b.slice(prefix, b.length - suffix);
  const rows: DiffLine[] = a.slice(0, prefix).map((text, i) => ({ kind: "context", text, old: i + 1, next: i + 1 }));
  let i = 0; let j = 0;
  if (x.length * y.length <= 1_000_000) {
    const table = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
    for (let m = x.length - 1; m >= 0; m--) for (let n = y.length - 1; n >= 0; n--) table[m][n] = x[m] === y[n] ? table[m + 1][n + 1] + 1 : Math.max(table[m + 1][n], table[m][n + 1]);
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { rows.push({ kind: "context", text: x[i], old: prefix + i + 1, next: prefix + j + 1 }); i++; j++; }
      else if (i < x.length && (j === y.length || table[i + 1][j] >= table[i][j + 1])) { rows.push({ kind: "remove", text: x[i], old: prefix + i + 1 }); i++; }
      else { rows.push({ kind: "add", text: y[j], next: prefix + j + 1 }); j++; }
    }
  } else {
    rows.push(...x.map((text, i): DiffLine => ({ kind: "remove", text, old: prefix + i + 1 })), ...y.map((text, j): DiffLine => ({ kind: "add", text, next: prefix + j + 1 })));
  }
  for (let k = suffix; k > 0; k--) rows.push({ kind: "context", text: a[a.length - k], old: a.length - k + 1, next: b.length - k + 1 });
  const chunks: DiffChunk[] = [];
  for (let start = 0; start < rows.length;) {
    if (rows[start].kind !== "context") { chunks.push(rows[start++]); continue; }
    let end = start; while (end < rows.length && rows[end].kind === "context") end++;
    if (end - start > context * 2 + 1) { chunks.push(...rows.slice(start, start + context), { kind: "fold", lines: rows.slice(start + context, end - context) }, ...rows.slice(end - context, end)); }
    else chunks.push(...rows.slice(start, end));
    start = end;
  }
  return chunks;
}
