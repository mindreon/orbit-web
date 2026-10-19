/** Follows the system colour scheme by setting html[data-theme], which index.css keys the dark palette on. */
export function followSystemTheme(root: HTMLElement = document.documentElement): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    root.dataset.theme = query.matches ? "dark" : "light";
  };
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
