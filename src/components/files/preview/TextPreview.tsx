import type { PreviewProps } from "./types";

export default function TextPreview({ text = "" }: PreviewProps) {
  return <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-mono text-caption text-foreground">{text}</pre>;
}
