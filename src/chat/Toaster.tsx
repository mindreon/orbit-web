import { Check, TriangleAlert } from "lucide-react";
import { useToast } from "../lib/toast";

export function Toaster() {
  const toast = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4" aria-live="polite">
      {toast ? (
        <p key={toast.id} role="status" className="inline-flex items-center gap-1.5 rounded-full bg-[#1f2328] px-3 py-1.5 text-xs text-white shadow-lg">
          {toast.tone === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
