import type { FC, LazyExoticComponent } from "react";

/** Where a file's bytes come from. Artifacts, expert files and skill files each have their own endpoint; the shell only sees this. */
export interface FileSource {
  readonly name: string;
  readonly mediaType?: string;
  /** Bytes. Unknown sizes skip the "too large" check. */
  readonly size?: number;
  readonly readText: () => Promise<string>;
  readonly readBlob: () => Promise<Blob>;
  readonly download: () => void;
}

/** What the shell hands a previewer. Only the field that matches the previewer's `load` is set. */
export interface PreviewProps {
  readonly name: string;
  readonly text?: string;
  readonly blob?: Blob;
  /** Markdown only: drop a leading YAML header (expert and skill docs carry one for machines). */
  readonly hideFrontmatter?: boolean;
  /** Overrides the language picked from the file name (the source view of html / markdown / svg). */
  readonly language?: string;
}

export interface Previewer {
  readonly id: string;
  match(name: string, mediaType?: string): boolean;
  readonly load: "text" | "blob";
  readonly component: LazyExoticComponent<FC<PreviewProps>>;
  /** Over this many bytes the shell shows "too large" plus download instead of loading the file. */
  readonly maxBytes?: number;
  /** The shell offers a rendered / source toggle; source is shown with the code previewer. */
  readonly hasSource?: boolean;
  /** Always keep the download button prominent: the render is an approximation. */
  readonly approximate?: boolean;
}
