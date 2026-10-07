import { useEffect, useState } from "react";
import type { PreviewProps } from "./types";

/**
 * SVG is shown through an `<img>` and never put into the page: an image-mode SVG runs no script and loads no outside
 * resources, and it cannot reach the page's DOM, storage or session.
 */
export default function SvgPreview({ name, text }: PreviewProps) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (text === undefined) return;
    const next = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [text]);
  return url ? <img src={url} alt={name} className="mx-auto max-w-full p-4" /> : null;
}
