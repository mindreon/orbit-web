import type { FileSource } from "./types";

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

/** Bytes behind a (signed) URL that is resolved on demand: task artifacts. */
export function urlSource(file: { name: string; mediaType?: string; size?: number }, resolveUrl: () => Promise<string>): FileSource {
  return {
    ...file,
    readText: async () => (await fetchOk(await resolveUrl())).text(),
    readBlob: async () => (await fetchOk(await resolveUrl())).blob(),
    download: () => void resolveUrl().then((url) => window.open(url, "_blank", "noopener,noreferrer")),
  };
}

/** Text already in memory: expert and skill files, whose endpoints return the content as a string. */
export function textSource(file: { name: string; size?: number }, text: string): FileSource {
  return {
    ...file,
    readText: () => Promise.resolve(text),
    readBlob: () => Promise.resolve(new Blob([text])),
    download: () => {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name.slice(file.name.lastIndexOf("/") + 1);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
