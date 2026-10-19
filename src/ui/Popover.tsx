import * as Primitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";
export function Popover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return <Primitive.Root><Primitive.Trigger asChild>{trigger}</Primitive.Trigger><Primitive.Portal><Primitive.Content sideOffset={4} className="z-50 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-card p-3 text-body shadow-lg">{children}</Primitive.Content></Primitive.Portal></Primitive.Root>;
}
