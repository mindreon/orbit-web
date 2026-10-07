import { Hand, ShieldAlert, ShieldCheck, ShieldPlus, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { PermissionPreset } from "../../lib/permissions";

/** One icon per permission preset, shared by the composer menu and the settings rows. The words live in `lib/display.ts`. */
export const PRESET_ICONS: Readonly<Record<PermissionPreset, LucideIcon>> = {
  default: ShieldCheck,
  request: Hand,
  auto: ShieldPlus,
  full: ShieldAlert,
  custom: SlidersHorizontal,
};
