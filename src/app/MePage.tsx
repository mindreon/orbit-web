import { Button } from "../ui/Button";
import { PageBody, PageHeader } from "../ui/PageHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { panelClass } from "../ui/card";
import { cn } from "../lib/cn";
import { useAuth } from "./auth/context";
import { toast } from "./toast/store";

export function MePage() {
  const { principal, tenants, currentTenant, roles, switchTenant } = useAuth();
  if (!principal) return null;

  return (
    <>
      <PageHeader title="我" />
      <PageBody narrow>
        <div className="space-y-5">
          <section className={cn(panelClass, "space-y-3 p-5")}>
            <h2 className="text-body font-semibold text-foreground">账号</h2>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-body">
              <dt className="text-muted-foreground">显示名</dt>
              <dd className="min-w-0 break-words text-foreground">{principal.display_name || "—"}</dd>
              <dt className="text-muted-foreground">邮箱</dt>
              <dd className="min-w-0 break-words text-foreground">{principal.email}</dd>
              <dt className="text-muted-foreground">账号 ID</dt>
              <dd className="min-w-0 break-all font-mono text-small text-foreground">{principal.id}</dd>
              <dt className="text-muted-foreground">角色</dt>
              <dd className="flex flex-wrap gap-1.5">
                {roles.length === 0 ? <span className="text-muted-foreground">—</span> : roles.map((role) => <StatusBadge key={role}>{role}</StatusBadge>)}
              </dd>
            </dl>
          </section>

          <section className={cn(panelClass, "p-5")}>
            <h2 className="text-body font-semibold text-foreground">租户</h2>
            <ul className="mt-3 divide-y divide-border">
              {tenants.map((tenant) => {
                const current = tenant.id === currentTenant?.id;
                return (
                  <li key={tenant.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-foreground">{tenant.name}</p>
                      <p className="truncate text-small text-muted-foreground">{tenant.slug}</p>
                    </div>
                    {current ? (
                      <StatusBadge tone="info">当前</StatusBadge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          switchTenant(tenant.id);
                          toast.success(`已切换到 ${tenant.name}`);
                        }}
                      >
                        切换
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </PageBody>
    </>
  );
}
