import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, describeFailure, isRetryable } from "../../api/errors";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pager } from "../../components/Pager";
import { useIdentity } from "../../platform/identity";
import { qk } from "../../platform/queryKeys";
import { toast } from "../../platform/toast/store";
import { useIdempotencyIntent } from "../../platform/useIdempotencyIntent";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { DropdownMenu } from "../../ui/DropdownMenu";
import { Skeleton } from "../../ui/Skeleton";
export const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";
export function QueryState({ query, children }: { query: { isPending: boolean; error: unknown; refetch(): unknown }; children: ReactNode }) {
  if (query.isPending) return <Skeleton className="h-40" />;
  if (query.error) return <Alert>{describeFailure("加载失败", query.error)}{isRetryable(query.error) ? <Button onClick={() => void query.refetch()}>重试</Button> : null}</Alert>;
  return children;
}
export function More({ name, items }: { name: string; items: { label: string; disabled?: boolean; danger?: boolean; onSelect(): void }[] }) { return <DropdownMenu trigger={<Button variant="ghost" aria-label={`${name}操作`}><MoreHorizontal className="h-4 w-4" /></Button>} items={items} />; }
export function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage(): unknown } }) { return <Pager hasNextPage={query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => void query.fetchNextPage()} />; }
export function useAdminWrite(resource: string, input: unknown) {
  const { currentTenant } = useIdentity(); const cache = useQueryClient(); const intent = useIdempotencyIntent(input); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>();
  return { busy, error, async run(action: (key: string) => Promise<unknown>, success?: (value: unknown) => void) {
    setBusy(true); setError(undefined);
    try { const value = await action(intent.key); intent.succeeded(); await cache.invalidateQueries({ queryKey: qk.admin(currentTenant?.id ?? null, resource) }); if (resource.startsWith("workspace")) { await cache.invalidateQueries({ queryKey: qk.adminRoot(currentTenant?.id ?? null) }); await cache.invalidateQueries({ queryKey: qk.workspaces(currentTenant?.id ?? null) }); } toast.success("操作成功"); success?.(value); }
    catch (failure) { setError(failure); toast.error(describeFailure("操作失败", failure)); }
    finally { setBusy(false); }
  } };
}
export function FormDialog({ title, onClose, onSubmit, busy, error, children, submitDisabled = false }: { title: string; onClose(): void; onSubmit(): void; busy: boolean; error: unknown; children: ReactNode; submitDisabled?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const details = error instanceof ApiError && error.details && typeof error.details === "object" ? error.details as Record<string, unknown> : {};
  const field = typeof details.field === "string" ? details.field : null;
  const message = typeof details.message === "string" ? details.message : error instanceof ApiError ? error.message : "";
  useEffect(() => {
    if (!field) return;
    const frame = requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${field.replace(/[^a-zA-Z0-9_]/g, "")}"]`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [field, error]);
  const content = Children.map(children, (child) => {
    if (!isValidElement<{ error?: string; children?: ReactNode }>(child) || !isValidElement<{ name?: string }>(child.props.children)) return child;
    return child.props.children.props.name === field ? cloneElement(child, { error: message }) : child;
  });
  const mapped = Children.toArray(content).some((child) => isValidElement<{ error?: string }>(child) && Boolean(child.props.error));
  return <Dialog title={title} onClose={onClose}><form ref={form} className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!busy && !submitDisabled) onSubmit(); }}>{content}{error && !mapped ? <Alert>{describeFailure("保存失败", error)}</Alert> : null}<div className="flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="submit" variant="primary" disabled={busy || submitDisabled}>保存</Button></div></form></Dialog>;
}
export function DestructiveAction({ name, resource, action, onClose }: { name: string; resource: string; action(key: string): Promise<unknown>; onClose(): void }) {
  const write = useAdminWrite(resource, name);
  return <ConfirmDialog name={name} busy={write.busy} onClose={onClose} onConfirm={() => void write.run(action, onClose)} />;
}
