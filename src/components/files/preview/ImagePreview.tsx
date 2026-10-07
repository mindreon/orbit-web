import { useEffect, useState } from "react";
import type { PreviewProps } from "./types";

/** Raster images through an object URL; the bytes are loaded by the shell. */
export default function ImagePreview({ name, blob }: PreviewProps) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? <img src={url} alt={name} className="mx-auto max-w-full p-4" /> : null;
}
