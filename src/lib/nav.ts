/** Locked W0 destinations. Do not add items. */
export const NAV_ITEMS = [
  { href: "/agents", label: "Agents" },
  { href: "/rooms", label: "Rooms" },
  { href: "/approvals", label: "Approvals", unreadPlaceholder: true },
  { href: "/settings", label: "Settings" },
] as const;

export const DEFAULT_HREF = "/rooms";
