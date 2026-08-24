"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", className, iconClassName }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        if (await copyToClipboard(value ?? "")) setCopied(true);
      }}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint",
        "transition-colors duration-150 hover:bg-surface-hover hover:text-ink",
        className,
      )}
    >
      <Icon
        className={cn("h-3.5 w-3.5", copied && "text-positive", iconClassName)}
        aria-hidden
      />
    </button>
  );
}
