import { useEffect } from "react";
import { Outlet } from "react-router";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useTenantSelection } from "../identity/context";
import { useIdentity } from "../identity";

import { selectTenant } from "./selectTenant";

export function TenantGate() {
  const { tenants, currentTenant, defaultTenant, rememberedTenant, signOut } = useIdentity();
  const switchTenant = useTenantSelection();
  const selected = selectTenant(tenants, currentTenant?.id ?? null, defaultTenant, rememberedTenant);
  useEffect(() => { if (selected && selected !== currentTenant?.id) switchTenant(selected); }, [selected, currentTenant?.id, switchTenant]);
  if (!selected) return <div className="space-y-4 p-6"><p className="text-body text-muted-foreground">账号尚未开通，请联系管理员</p><Button onClick={() => void signOut()}>退出登录</Button></div>;
  if (selected !== currentTenant?.id) return <Skeleton className="m-6 h-24" />;
  return <Outlet />;
}
