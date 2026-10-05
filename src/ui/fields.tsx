import { ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const FIELD =
  "w-full rounded-control border border-input bg-card px-3 text-body text-foreground outline-none placeholder:text-muted-foreground hover:border-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "h-9", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "py-2", className)} {...rest} />;
}

/** 原生 select，去掉系统箭头，换成和 baize 一致的图标。 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn("relative inline-block", className)}>
      <select className={cn(FIELD, "h-9 appearance-none pr-8")} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-body">
      <span className="mb-1 block text-small font-medium text-gray-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-small text-danger-700">{error}</span> : null}
    </label>
  );
}
