import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "../../../ui/Skeleton";
import type { PreviewProps } from "./types";

GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const BTN = "flex h-7 w-7 items-center justify-center rounded-control text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent";

/** PDF pages drawn to a canvas by pdf.js (its worker is a separate asset, fetched with the chunk). One page at a time, with page and zoom controls. */
export default function PdfPreview({ blob }: PreviewProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!blob) return;
    let gone = false;
    let task: PDFDocumentLoadingTask | null = null;
    void blob
      .arrayBuffer()
      .then((buffer) => {
        if (gone) return undefined;
        task = getDocument({ data: new Uint8Array(buffer) });
        return task.promise;
      })
      .then((loaded) => {
        if (gone || !loaded) return;
        setDoc(loaded);
        setPage(1);
      })
      .catch(() => !gone && setError("PDF 无法打开，请下载查看"));
    return () => {
      gone = true;
      void task?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!doc || !canvas.current) return;
    let gone = false;
    let render: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void doc.getPage(page).then((pdfPage) => {
      const target = canvas.current;
      if (gone || !target) return;
      const ratio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: zoom * 1.25 * ratio });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = `${Math.floor(viewport.width / ratio)}px`;
      target.style.height = `${Math.floor(viewport.height / ratio)}px`;
      render = pdfPage.render({ canvas: target, viewport });
      render.promise.catch(() => undefined);
    });
    return () => {
      gone = true;
      render?.cancel();
    };
  }, [doc, page, zoom]);

  if (error) return <p className="p-5 text-body text-muted-foreground">{error}</p>;
  if (!doc) return <Skeleton className="m-4 h-48" />;
  const pages = doc.numPages;
  const step = ZOOMS.indexOf(zoom);
  return (
    <div data-testid="pdf-preview" className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-center gap-1 bg-secondary px-3 py-1">
        <button type="button" aria-label="上一页" className={BTN} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <span data-testid="pdf-page" className="min-w-[4.5rem] text-center text-small text-foreground">
          {page} / {pages}
        </span>
        <button type="button" aria-label="下一页" className={BTN} disabled={page >= pages} onClick={() => setPage(page + 1)}>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
        <button type="button" aria-label="缩小" className={BTN} disabled={step <= 0} onClick={() => setZoom(ZOOMS[step - 1])}>
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <span data-testid="pdf-zoom" className="min-w-[3rem] text-center text-small text-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" aria-label="放大" className={BTN} disabled={step >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[step + 1])}>
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <canvas ref={canvas} aria-label={`第 ${page} 页`} className="mx-auto block max-w-none bg-white shadow-sm" />
      </div>
    </div>
  );
}
