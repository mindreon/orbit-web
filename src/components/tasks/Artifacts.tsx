import { getArtifactURL, type ArtifactManifest } from "../../lib/tasks";
import { Section, SectionEmpty } from "./Section";

export function Artifacts({ manifests }: { readonly manifests: readonly ArtifactManifest[] }) {
  const open = (manifestId: string, name: string) =>
    void getArtifactURL(manifestId, name).then((url) => window.open(url, "_blank", "noopener,noreferrer"));
  return (
    <Section title="成果物" label="成果物">
      {manifests.length === 0 ? <SectionEmpty>暂无成果物</SectionEmpty> : manifests.map((manifest) => (
        <div key={manifest.manifest_id} className="mt-2 rounded-lg border border-border p-3">
          <p className="break-all font-mono text-xs text-muted-foreground">{manifest.manifest_id}</p>
          {manifest.entries.map((entry) => {
            const name = typeof entry.name === "string" ? entry.name : "";
            return name ? <button key={name} type="button" className="mt-2 block text-left text-sm text-primary hover:underline" onClick={() => open(manifest.manifest_id, name)}>{name}</button> : null;
          })}
        </div>
      ))}
    </Section>
  );
}
