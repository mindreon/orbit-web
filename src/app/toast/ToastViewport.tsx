import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "../../lib/cn";
import { useToastStore, type Toast, type ToastTone } from "./store";

const TONES: Record<ToastTone, { box: string; Icon: typeof Info }> = {
  success: { box: "bg-success-50 text-success-700", Icon: CircleCheck },
  info: { box: "bg-primary-50 text-primary-700", Icon: Info },
  danger: { box: "bg-danger-50 text-danger-700", Icon: CircleAlert },
};

/** An error stays long enough to read; a confirmation does not. */
const LIFETIME_MS: Record<ToastTone, number> = { success: 4000, info: 4000, danger: 8000 };

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const { box, Icon } = TONES[toast.tone];
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), LIFETIME_MS[toast.tone]);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id, toast.tone]);
  return (
    <li className={cn("pointer-events-auto flex items-start gap-2 rounded-card px-3 py-2.5 text-body shadow-md", box)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{toast.message}</span>
      <button type="button" aria-label="关闭提示" className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-control hover:bg-gray-200" onClick={() => dismiss(toast.id)}>
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Mounted once at the top of the app. */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <ol role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} />
      ))}
    </ol>
  );
}
