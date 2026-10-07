import { stripFrontmatter } from "../../../lib/display";
import { RichText } from "../../markdown/RichText";
import type { PreviewProps } from "./types";

export default function MarkdownPreview({ text = "", hideFrontmatter }: PreviewProps) {
  return (
    <div className="min-h-full p-5">
      <RichText text={hideFrontmatter ? stripFrontmatter(text) : text} />
    </div>
  );
}
