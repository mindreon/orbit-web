import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border bg-card text-foreground hover:bg-secondary",
  ghost: "text-gray-700 hover:bg-secondary",
  danger: "border border-danger-200 bg-card text-danger-700 hover:bg-danger-50",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-small",
  md: "h-9 px-4 text-body",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function Button({ variant = "secondary", size = "md", type = "button", className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
