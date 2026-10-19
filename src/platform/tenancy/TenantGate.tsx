import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Button } from "../../ui/Button";
import { Skeleton } from "../../ui/Skeleton";
import { useTenantSelection } from "../identity/context";
import { useIdentity } from "../identity";

import { selectTenant } from "./selectTenant";

export function TenantGate() {
  const { tenants, currentTenant, defaultTenant, rememberedTenant, signOut, principal } = useIdentity();
  const [copyStatus, setCopyStatus] = useState("");
  const switchTenant = useTenantSelection();
  const selected = selectTenant(tenants, currentTenant?.id ?? null, defaultTenant, rememberedTenant);
  useEffect(() => { if (selected && selected !== currentTenant?.id) switchTenant(selected); }, [selected, currentTenant?.id, switchTenant]);
  if (!selected) return <main className="flex min-h-dvh items-center justify-center p-4"><div className="max-w-reading space-y-4"><p className="text-body text-muted-foreground">账号尚未开通，请联系管理员</p>{principal ? <div className="flex flex-wrap items-center gap-2"><span className="text-small">账号 ID</span><code className="break-all text-small">{principal.id}</code><Button onClick={() => void navigator.clipboard.writeText(principal.id).then(() => setCopyStatus("已复制"), () => setCopyStatus("复制失败，请手动复制账号 ID"))}>复制账号 ID</Button><span role="status" className="text-small">{copyStatus}</span></div> : null}<Button onClick={() => void signOut()}>退出登录</Button></div></main>;
  if (selected !== currentTenant?.id) return <Skeleton className="m-6 h-24" />;
  return <Outlet />;
}
