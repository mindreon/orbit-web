import { getArtifactURL, type ArtifactManifest } from "../../lib/tasks";

export function Artifacts({ manifests }: { readonly manifests: readonly ArtifactManifest[] }) {
  const open = (manifestId: string, name: string) =>
    void getArtifactURL(manifestId, name).then((url) => window.open(url, "_blank", "noopener,noreferrer"));
  return (
    <section aria-label="成果物" className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">成果物</h3>
      {manifests.length === 0 ? <p className="mt-2 text-xs text-slate-400">暂无成果物</p> : manifests.map((manifest) => (
        <div key={manifest.manifest_id} className="mt-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-700">{manifest.manifest_id}</p>
          {manifest.entries.map((entry) => {
            const name = typeof entry.name === "string" ? entry.name : "";
            return name ? <button key={name} type="button" className="mt-2 block text-left text-xs text-blue-600 underline" onClick={() => open(manifest.manifest_id, name)}>{name}</button> : null;
          })}
        </div>
      ))}
    </section>
  );
}
