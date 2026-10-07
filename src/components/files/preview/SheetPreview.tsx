import { useEffect, useMemo, useState } from "react";
import { cn } from "../../../lib/cn";
import { Skeleton } from "../../../ui/Skeleton";
import type { PreviewProps } from "./types";

/** Past these the table is cut and the notice says so: a sheet can hold a million rows. */
const MAX_ROWS = 500;
const MAX_COLS = 50;

interface Sheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
  readonly truncated: boolean;
}

async function parse(blob: Blob, name: string): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const csv = /\.(csv|tsv)$/i.test(name);
  // CSV is read as a string so UTF-8 survives; the binary formats go in as bytes. `sheetRows` stops the parser early.
  const book = csv ? XLSX.read(await blob.text(), { type: "string", sheetRows: MAX_ROWS + 1 }) : XLSX.read(await blob.arrayBuffer(), { type: "array", sheetRows: MAX_ROWS + 1 });
  return book.SheetNames.map((sheetName) => {
    const sheet = book.Sheets[sheetName];
    const all = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
    return { name: sheetName, rows: all.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLS).map(String)), truncated: all.length > MAX_ROWS || all.some((row) => row.length > MAX_COLS) };
  });
}

/** Spreadsheets and CSV as a table with a tab per sheet, parsed by SheetJS. Cells show their formatted text; nothing is evaluated. */
export default function SheetPreview({ name, blob }: PreviewProps) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!blob) return;
    let gone = false;
    setSheets(null);
    setError("");
    setActive(0);
    parse(blob, name)
      .then((next) => !gone && setSheets(next))
      .catch(() => !gone && setError("表格无法打开，请下载查看"));
    return () => {
      gone = true;
    };
  }, [blob, name]);
  const sheet = sheets?.[active];
  const width = useMemo(() => Math.max(1, ...(sheet?.rows.map((row) => row.length) ?? [1])), [sheet]);
  if (error) return <p className="p-5 text-body text-muted-foreground">{error}</p>;
  if (!sheets || !sheet) return <Skeleton className="m-4 h-48" />;
  return (
    <div data-testid="sheet-preview" className="flex min-h-full flex-col">
      {sheets.length > 1 ? (
        <div role="tablist" aria-label="工作表" className="flex shrink-0 gap-1 overflow-x-auto bg-secondary px-3 py-1">
          {sheets.map((item, index) => (
            <button key={item.name} type="button" role="tab" aria-selected={index === active} className={cn("h-6 shrink-0 rounded-control px-2 text-small", index === active ? "bg-card font-medium text-foreground shadow-sm" : "text-gray-600 hover:bg-gray-200")} onClick={() => setActive(index)}>
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-small">
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th scope="row" className="sticky left-0 border border-border bg-secondary px-2 py-1 text-right text-caption font-normal text-muted-foreground">
                  {r + 1}
                </th>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="max-w-[24rem] truncate border border-border px-2 py-1 text-foreground" title={row[c]}>
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated ? (
        <p data-testid="sheet-truncated" className="shrink-0 bg-secondary px-4 py-2 text-small text-muted-foreground">
          仅显示前 {MAX_ROWS} 行、{MAX_COLS} 列，完整内容请下载查看
        </p>
      ) : null}
    </div>
  );
}
