"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eraser, MessagesSquare, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { ChatComposer } from "@/components/workspace/chat-composer";
import { ChatMessage, StreamingMessage } from "@/components/workspace/chat-message";
import { useChat } from "@/components/workspace/use-chat";
import { api } from "@/lib/api";
import { EXAMPLE_QUESTIONS } from "@/lib/constants";
import { useKeyboardShortcut } from "@/lib/hooks";

/** Stick to the bottom only while the reader is already there. */
function useAutoScroll(dependencies) {
  const endRef = useRef(null);
  const containerRef = useRef(null);
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    pinnedRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (pinnedRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  return { endRef, containerRef, onScroll };
}

export function ChatPanel({ repository, onContext, onOpenFile }) {
  const [draft, setDraft] = useState("");
  const composerRef = useRef(null);

  const { chatId, messages, streaming, loading, error, send, stop, clear, isStreaming } = useChat(
    repository.id,
    { onContext },
  );

  const { endRef, containerRef, onScroll } = useAutoScroll([messages.length, streaming?.content]);

  useKeyboardShortcut("l", () => composerRef.current?.focus(), { meta: true });

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const exportChat = async () => {
    if (!chatId) return;
    try {
      // Fetched rather than linked so the Authorization header is sent.
      const markdown = await api.chat.exportMarkdown(chatId);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${repository.name}-chat.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Conversation exported.");
    } catch (caught) {
      toast.error(caught.message ?? "Could not export this conversation.");
    }
  };

  const clearChat = async () => {
    try {
      await clear();
      toast.success("Conversation cleared.");
    } catch (caught) {
      toast.error(caught.message ?? "Could not clear this conversation.");
    }
  };

  const isEmpty = !loading && messages.length === 0 && !streaming;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-subtle">
          <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
          CHAT
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={exportChat}
            disabled={!messages.length}
            title="Export conversation as Markdown"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            disabled={!messages.length || isStreaming}
            title="Clear this conversation"
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
      >
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={MessagesSquare}
            title={`Ask ${repository.name} anything`}
            description="Answers are grounded in the indexed source and cite the exact files and lines they came from."
            action={
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => send(question)}
                    className="rounded-full border border-line bg-surface-raised px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-ink"
                  >
                    {question}
                  </button>
                ))}
              </div>
            }
          />
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} onOpenFile={onOpenFile} />
            ))}
            {streaming && <StreamingMessage content={streaming.content} />}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/10 px-3.5 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-critical">{error.message}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <ChatComposer
        ref={composerRef}
        value={draft}
        onChange={setDraft}
        onSubmit={send}
        onStop={stop}
        streaming={isStreaming}
        placeholder={`Ask about ${repository.name}…`}
      />
    </div>
  );
}
