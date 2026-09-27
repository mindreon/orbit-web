/** 技能卡片和详情页共用的展示规则。图标只允许 SkillHub 自己的图片域名。 */

const ICON_COLORS = [
  { bg: "rgba(0,122,255,0.12)", fg: "#007AFF" },
  { bg: "rgba(175,82,222,0.12)", fg: "#AF52DE" },
  { bg: "rgba(52,199,89,0.12)", fg: "#34C759" },
  { bg: "rgba(255,149,0,0.12)", fg: "#FF9500" },
];

const ICON_HOSTS = new Set([
  "cloudcache.tencent-cloud.com",
  "cloudcache.tencent-cloud.cn",
  "cloudcache.tencentcs.com",
  "cloudcache.tencentcs.cn",
  "skillhub.cn",
  "api.skillhub.cn",
]);

export function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} 千`;
  return String(Math.round(value));
}

export function sourceLabel(source: string) {
  if (source === "clawhub") return "ClawHub";
  if (source === "enterprise") return "企业";
  if (source === "community") return "SkillHub";
  return "";
}

export function tint(name: string) {
  let n = 0;
  for (const ch of name) n += ch.charCodeAt(0);
  return ICON_COLORS[n % ICON_COLORS.length];
}

export function safeIcon(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !ICON_HOSTS.has(parsed.hostname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

/** 详情页地址。没有作者时只带 slug，对应目录里单独一行。 */
export function skillPath(handle: string, slug: string) {
  if (!slug) return "/experts/skills";
  if (!handle) return `/experts/skills/${encodeURIComponent(slug)}`;
  return `/experts/skills/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
}

export function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}
