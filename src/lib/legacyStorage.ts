/**
 * Defensive cleanup for model-key material that older experimental builds might have
 * persisted. On main through 3d74ad9, custom models lived only in module memory
 * (`src/lib/customModels.ts`, deleted in trim PR) and never wrote browser storage.
 * These key names are reserved for any side-loaded or forked builds that did.
 */

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
