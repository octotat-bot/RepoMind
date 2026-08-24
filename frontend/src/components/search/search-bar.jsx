"use client";

import { forwardRef } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const SearchBar = forwardRef(function SearchBar(
  {
    value,
    onChange,
    onSubmit,
    disabled = false,
    loading = false,
    placeholder = "Describe the code you are looking for…",
  },
  ref,
) {
  const submit = (event) => {
    event.preventDefault();
    onSubmit?.(value);
  };

  return (
    <form onSubmit={submit} className="relative">
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-line bg-surface px-4",
          "transition-colors duration-150 focus-within:border-white/25",
          "focus-within:ring-2 focus-within:ring-white/10 hover:border-line-strong",
          disabled && "opacity-50",
        )}
      >
        <Search className="h-[18px] w-[18px] shrink-0 text-ink-subtle" aria-hidden />
        <input
          ref={ref}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Semantic code search"
          placeholder={placeholder}
          className={cn(
            "h-16 min-w-0 flex-1 bg-transparent text-[15px] text-ink",
            "placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed",
          )}
        />

        {value ? (
          <button
            type="button"
            onClick={() => onChange?.("")}
            aria-label="Clear query"
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <span className="hidden items-center gap-1.5 text-[11px] text-ink-faint sm:flex">
            <Kbd>/</Kbd>
            to focus
          </span>
        )}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={loading}
          disabled={disabled || !value.trim()}
        >
          Search
          {!loading && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />}
        </Button>
      </div>
    </form>
  );
});
