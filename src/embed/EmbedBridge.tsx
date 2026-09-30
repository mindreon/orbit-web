import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { menuSections } from "../shell/nav";
import { EMBED_EVENTS } from "./wujie";

/**
 * 嵌入态桥，只做 bus 协议：
 * - 路由变化 → 上报 route-change（基座 replaceState 同步地址栏）
 * - 收到 navigate → navigate(replace)；与当前地址相同则忽略，避免回环
 * - 挂载时上报一次菜单目录
 * 独立部署时不渲染任何东西，也不订阅任何事件。
 */
export function EmbedBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = `${location.pathname}${location.search}`;

  useEffect(() => {
    window.$wujie?.bus.$emit(EMBED_EVENTS.routeChange, current);
  }, [current]);

  useEffect(() => {
    const bus = window.$wujie?.bus;
    if (!bus) return;
    const onNavigate = (...args: unknown[]) => {
      const target = args[0];
      if (typeof target !== "string" || !target.startsWith("/") || target === current) return;
      navigate(target, { replace: true });
    };
    bus.$on(EMBED_EVENTS.navigate, onNavigate);
    return () => bus.$off(EMBED_EVENTS.navigate, onNavigate);
  }, [current, navigate]);

  useEffect(() => {
    window.$wujie?.bus.$emit(EMBED_EVENTS.menu, menuSections());
  }, []);

  return null;
}
