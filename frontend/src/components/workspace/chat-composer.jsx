"use client";

import { forwardRef, useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 168;

/** Auto-growing question box. Enter sends, Shift+Enter adds a newline. */
export const ChatComposer = forwardRef(function ChatComposer(
  { value, onChange, onSubmit, onStop, streaming = false, disabled = false, placeholder },
  ref,
) {
  const innerRef = useRef(null);
  const textareaRef = ref ?? innerRef;

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value, textareaRef]);

  const submit = () => {
    if (!value.trim() || streaming || disabled) return;
    onSubmit(value);
    onChange("");
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-line bg-surface/40 px-4 py-3">
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-line bg-surface px-3 py-2",
          "transition-colors focus-within:border-white/25 focus-within:ring-2 focus-within:ring-white/10",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "Ask anything about this repository…"}
          aria-label="Ask a question about this repository"
          className={cn(
            "min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed text-ink",
            "placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed",
          )}
        />

        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Send question"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink text-canvas",
              "transition-all hover:bg-white/90 disabled:pointer-events-none disabled:opacity-30",
            )}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-ink-faint">
        <Kbd>↵</Kbd> to send
        <span className="text-ink-faint/50">·</span>
        <Kbd>⇧</Kbd>
        <Kbd>↵</Kbd> for a new line
      </p>
    </div>
  );
});
