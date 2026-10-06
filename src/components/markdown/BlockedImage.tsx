import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { Dialog } from "../../ui/Dialog";

/** A dialog cannot sit inside a paragraph, so it goes to the page root; inside an embedding shadow root, to that root, where the styles are. */
function lightboxHost(anchor: HTMLElement | null): Element | DocumentFragment {
  const root = anchor?.getRootNode();
  return root instanceof ShadowRoot ? root : document.body;
}

/**
 * Images in model output never load on their own: a remote URL can track the reader or hit internal hosts.
 * The reader sees the address and decides. Once loaded, clicking the image opens it large in a lightbox (Esc closes).
 */
export function BlockedImage({ src, alt }: { src?: string; alt?: string }) {
  const [allowed, setAllowed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  if (!src) return alt ? <span className="text-muted-foreground">[图片：{alt}]</span> : null;
  if (allowed) {
    const title = alt || "图片预览";
    return (
      <>
        <button ref={anchor} type="button" aria-label={`查看大图：${title}`} className="my-2 block max-w-full cursor-zoom-in rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setZoomed(true)}>
          <img src={src} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" className="max-h-96 max-w-full rounded-control border" />
        </button>
        {zoomed
          ? createPortal(
              <Dialog title={title} wide onClose={() => setZoomed(false)}>
                <img data-testid="image-lightbox" src={src} alt={alt ?? ""} referrerPolicy="no-referrer" className="mx-auto max-h-[75vh] max-w-full rounded-control object-contain" />
              </Dialog>,
              lightboxHost(anchor.current),
            )
          : null}
      </>
    );
  }
  return (
    <span className="md-image-blocked" data-testid="blocked-image">
      <ImageOff className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
      <span className="min-w-0">
        <span className="block text-caption text-muted-foreground">外部图片未自动加载{alt ? ` · ${alt}` : ""}</span>
        <span className="block truncate font-mono text-caption text-gray-500" title={src}>
          {src}
        </span>
      </span>
      <button type="button" className="shrink-0 rounded-control border bg-card px-2 py-0.5 text-caption hover:bg-secondary" onClick={() => setAllowed(true)}>
        加载图片
      </button>
    </span>
  );
}
