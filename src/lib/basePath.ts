/** The path prefix the SPA is served under (Vite `base`, Router `basename`, OIDC redirect URLs); the API lives at `${BASE_PATH}/v1`. */
export const BASE_PATH = "/orbit";

/**
 * A path for `navigate()`: the router is mounted at BASE_PATH, so a path that still carries it
 * (`/orbit/sessions`) would be resolved again and land on `/orbit/orbit/sessions`. An empty result stays "/".
 */
export function toRouterPath(path: string): string {
  const url = new URL(path, "http://orbit.local");
  let pathname = url.pathname;
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) pathname = "/";
  else if (pathname.startsWith(`${BASE_PATH}/`)) pathname = pathname.slice(BASE_PATH.length);
  return `${pathname}${url.search}${url.hash}`;
}
