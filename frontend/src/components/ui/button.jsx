"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary:
    "bg-ink text-canvas hover:bg-white/90 active:bg-white/80 shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset]",
  secondary:
    "bg-surface-raised text-ink border border-line hover:bg-surface-hover hover:border-line-strong",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-hover",
  outline: "border border-line text-ink hover:bg-surface-hover hover:border-line-strong",
  danger: "bg-critical/10 text-critical border border-critical/25 hover:bg-critical/20",
};

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg",
};

export const Button = forwardRef(function Button(
  {
    className,
    variant = "secondary",
    size = "md",
    loading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap",
        "transition-all duration-150 ease-out select-none",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
