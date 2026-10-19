import * as Radix from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

/** Controlled, accessible dialog. The caller owns whether it remains mounted. */
export function Dialog({ title, onClose, children, wide = false, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const previous = useRef(document.activeElement as HTMLElement | null);
  return <Radix.Root open onOpenChange={(open) => { if (!open && dismissible) onClose(); }}>
    <Radix.Portal>
      <Radix.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Radix.Content aria-describedby={undefined} onEscapeKeyDown={dismissible ? undefined : (event) => event.preventDefault()} onPointerDownOutside={dismissible ? undefined : (event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); previous.current?.focus(); }} className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-card bg-card shadow-xl ${wide ? "max-w-4xl" : "max-w-md"}`}>
        <div className="flex h-14 items-center justify-between px-5">
          <Radix.Title className="text-title font-semibold text-foreground">{title}</Radix.Title>
          {dismissible ? <Radix.Close className="flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground hover:bg-secondary" aria-label="关闭"><X className="h-4 w-4" /></Radix.Close> : null}
        </div>
        <div className="px-5 pb-5">{children}</div>
      </Radix.Content>
    </Radix.Portal>
  </Radix.Root>;
}
