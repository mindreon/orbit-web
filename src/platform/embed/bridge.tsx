import { useEffect } from "react";

import { isEmbeddedInWujie } from "./types";

/**
 * 子应用与基座之间的 bus 事件协议（移植自 netflow packages/micro-fe/src/bridge.tsx）：
 * - `orbit:route-change`  子应用 → 基座：上报 `pathname + search`，基座同步地址栏与菜单高亮
 * - `orbit:navigate`      基座 → 子应用：导航到 `pathname + search`（前进/后退/基座内链接/alive 纠偏）
 * - `orbit:locale-change` 基座 → 子应用：orbit 无多语言，本期不订阅、收到即忽略
 * - `orbit:menu`          子应用 → 基座：菜单目录上报（可序列化，基座自行渲染）
 */
export interface WujieBusEvents {
  routeChange: string;
  navigate: string;
  menu: string;
}

export function wujieBusEvents(prefix: string): WujieBusEvents {
  return {
    routeChange: `${prefix}:route-change`,
    navigate: `${prefix}:navigate`,
    menu: `${prefix}:menu`,
  };
}

/** 上报给基座的菜单项（可序列化，基座用自己的组件/图标集渲染）；icon 为 lucide 图标名，exact 只在精确命中时高亮。 */
export interface WujieMenuItem {
  key: string;
  href: string;
  title: string;
  icon: string;
  exact?: boolean;
}

/** 上报给基座的菜单分组；groupTitle 为当前文案，基座可直接显示。 */
export interface WujieMenuSection {
  group: string;
  groupTitle: string;
  items: WujieMenuItem[];
}

/**
 * wujie 嵌入态路由桥（独立部署零行为）：pathname/search 变化 → 上报 route-change；
 * 接收 navigate → 以 replace 导航（兼容 alive 纠偏）。pathname 为去掉 basename 的子应用路径。
 */
export function WujieBridge({
  prefix,
  pathname,
  search,
  navigate,
}: {
  prefix: string;
  pathname: string;
  search: string;
  navigate: (path: string) => void;
}) {
  const events = wujieBusEvents(prefix);

  useEffect(() => {
    if (!isEmbeddedInWujie()) return;
    window.$wujie?.bus.$emit(events.routeChange, `${pathname}${search}`);
  }, [events.routeChange, pathname, search]);

  useEffect(() => {
    if (!isEmbeddedInWujie()) return;
    const bus = window.$wujie?.bus;
    if (!bus) return;

    const onNavigate = (...args: unknown[]) => {
      const target = args[0];
      if (typeof target !== "string") return;
      navigate(target);
    };
    bus.$on(events.navigate, onNavigate);
    return () => bus.$off(events.navigate, onNavigate);
  }, [events.navigate, navigate]);

  return null;
}

/** 菜单目录上报。sections 变化时经 JSON 签名比对后重新上报；standalone 返回 null，零行为。 */
export function WujieMenuBridge({
  prefix,
  sections,
}: {
  prefix: string;
  sections: WujieMenuSection[];
}) {
  const signature = JSON.stringify(sections);

  useEffect(() => {
    if (!isEmbeddedInWujie()) return;
    const bus = window.$wujie?.bus;
    if (!bus) return;
    bus.$emit(wujieBusEvents(prefix).menu, JSON.parse(signature) as WujieMenuSection[]);
  }, [prefix, signature]);

  return null;
}
