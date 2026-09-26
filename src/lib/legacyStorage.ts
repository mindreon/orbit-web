/** Remove client-side model key material from older builds. Keys belong on the control plane. */

export const LEGACY_MODEL_STORAGE_KEYS = [
  "mindbuddy:custom-models",
  "orbit-web:custom-models",
  "mindbuddy.customModels",
  "orbit.customModels",
] as const;

export function purgeLegacyModelStorage() {
  for (const key of LEGACY_MODEL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage access errors (private mode, disabled storage, etc.).
    }
  }
}
