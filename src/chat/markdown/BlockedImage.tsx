import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * Images in model output never load on their own: a remote URL can track the reader or hit internal hosts.
 * The reader sees the address and decides.
 */
export function BlockedImage({ src, alt }: { src?: string; alt?: string }) {
  const [allowed, setAllowed] = useState(false);
  if (!src) return alt ? <span className="text-muted-foreground">[图片：{alt}]</span> : null;
  if (allowed) {
    return <img src={src} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" className="my-2 max-h-96 max-w-full rounded-md border" />;
  }
  return (
    <span className="md-image-blocked" data-testid="blocked-image">
      <ImageOff className="h-4 w-4 shrink-0 text-[#999]" aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs text-[#666]">外部图片未自动加载{alt ? ` · ${alt}` : ""}</span>
        <span className="block truncate font-mono text-[11px] text-[#999]" title={src}>
          {src}
        </span>
      </span>
      <button type="button" className="shrink-0 rounded border bg-white px-2 py-0.5 text-xs hover:bg-[#f6f6f7]" onClick={() => setAllowed(true)}>
        加载图片
      </button>
    </span>
  );
}
