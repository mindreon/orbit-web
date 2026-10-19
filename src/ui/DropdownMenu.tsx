import * as Primitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
export function DropdownMenu({ trigger, items }: { trigger: ReactNode; items: readonly { label: string; disabled?: boolean; onSelect(): void }[] }) {
  return <Primitive.Root><Primitive.Trigger asChild>{trigger}</Primitive.Trigger><Primitive.Portal><Primitive.Content sideOffset={4} className="z-50 rounded-card border border-border bg-card p-1 text-body shadow-lg">{items.map((item) => <Primitive.Item key={item.label} disabled={item.disabled} onSelect={item.onSelect} className="min-h-11 cursor-default rounded-control px-3 py-2 outline-none data-[highlighted]:bg-secondary data-[disabled]:text-muted-foreground">{item.label}</Primitive.Item>)}</Primitive.Content></Primitive.Portal></Primitive.Root>;
}
