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
    return <img src={src} alt={alt ?? ""} referrerPolicy="no-referrer" loading="lazy" className="my-2 max-h-96 max-w-full rounded-control border" />;
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
