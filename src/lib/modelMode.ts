/** Map control-plane model mode to task-desk labels. Absent or unknown values render nothing. */

export function modelModeLabel(mode: string | undefined | null): "假模型" | "真模型" | null {
  if (!mode) return null;
  const normalized = mode.trim().toLowerCase();
  if (normalized === "fake" || normalized === "stub" || normalized === "mock") return "假模型";
  if (normalized === "real" || normalized === "live" || normalized === "production") return "真模型";
  return null;
}
