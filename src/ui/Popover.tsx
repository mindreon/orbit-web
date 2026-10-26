import * as Primitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/** 浮层。open 交给调用方时，选中一项之后可以把浮层关掉。 */
export function Popover({ trigger, children, open, onOpenChange, contentClassName }: { trigger: ReactNode; children: ReactNode; open?: boolean; onOpenChange?(open: boolean): void; contentClassName?: string }) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content align="start" sideOffset={4} className={cn("z-50 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-card p-3 text-body shadow-lg", contentClassName)}>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
