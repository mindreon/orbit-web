export const MAX_ARCHIVE = 50 * 1024 * 1024;
const encoder = new TextEncoder();
export function validatePath(path: string) {
  const parts = path.split("/");
  const base = parts.at(-1)!;
  if (/^[/]|[\0\n\r\\:]/.test(path) || parts.length > 32 || parts.some((p) => !p || p === "." || p === ".." || [".git", ".archive", "__pycache__", ".pytest_cache", "node_modules", "out", ".venv"].includes(p)) || ["id_rsa", "id_ed25519", "credentials.json", "token.json", "tokens.json", ".DS_Store"].includes(base) || /\.(pyc|key|p12|pfx)$/.test(base) || (base.startsWith(".env") && ![".env.example", ".env.template"].includes(base))) throw new Error(`不允许的文件路径：${path}`);
  splitPath(path);
}
function splitPath(path: string): [string, string] {
  if (encoder.encode(path).length <= 100) return [path, ""];
  for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
    if (encoder.encode(path.slice(0, i)).length <= 155 && encoder.encode(path.slice(i + 1)).length <= 100) return [path.slice(i + 1), path.slice(0, i)];
  }
  throw new Error(`文件路径过长：${path}`);
}
export type TarFiles = Readonly<Record<string, string | Uint8Array>>;
/** POSIX ustar regular files only; fixed metadata, UTF-8 byte sizes, two end blocks. */
export function tar(files: TarFiles): Uint8Array<ArrayBuffer> {
  const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (!entries.length || entries.length > 512) throw new Error("文件数量必须在 1–512 之间");
  const seen = new Set<string>(); let total = 1024;
  const data = entries.map(([path, value]) => {
    validatePath(path); const key = path.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error(`重复文件路径：${path}`); seen.add(key);
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    if (bytes.length > 20 * 1024 * 1024) throw new Error("单文件不能超过 20 MiB");
    total += 512 + Math.ceil(bytes.length / 512) * 512;
    if (total > MAX_ARCHIVE) throw new Error("压缩包不能超过 50 MiB");
    return { path, bytes };
  });
  for (const key of seen) { const parts = key.split("/"); parts.pop(); while (parts.length) { if (seen.has(parts.join("/"))) throw new Error("文件与目录路径冲突"); parts.pop(); } }
  const output = new Uint8Array(total); let offset = 0;
  for (const { path, bytes } of data) {
    const header = output.subarray(offset, offset + 512);
    const put = (start: number, value: string) => header.set(encoder.encode(value), start);
    const octal = (n: number, length: number) => n.toString(8).padStart(length - 1, "0") + "\0";
    const [name, prefix] = splitPath(path);
    put(0, name); put(100, octal(0o644, 8)); put(108, octal(0, 8)); put(116, octal(0, 8)); put(124, octal(bytes.length, 12)); put(136, octal(0, 12));
    header.fill(32, 148, 156); put(156, "0"); put(257, "ustar\0"); put(263, "00"); put(345, prefix);
    put(148, header.reduce((sum, b) => sum + b, 0).toString(8).padStart(6, "0") + "\0 ");
    output.set(bytes, offset + 512); offset += 512 + Math.ceil(bytes.length / 512) * 512;
  }
  return output;
}
export async function gzipTar(files: TarFiles): Promise<Blob> {
  const bytes = tar(files);
  return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}
