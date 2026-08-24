"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const STREAMING_ID = "streaming";

/**
 * Conversation state for one repository.
 *
 * The in-flight answer lives in `streaming` rather than in `messages` so the
 * token firehose only re-renders the bubble being written, and the finished
 * message is appended once from the server's authoritative `done` payload.
 */
export function useChat(repositoryId, { onContext } = {}) {
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const contextRef = useRef(onContext);
  contextRef.current = onContext;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.chat
      .conversation(repositoryId)
      .then((data) => {
        if (cancelled) return;
        setChatId(data.chat.id);
        setMessages(data.messages ?? []);
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [repositoryId]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Keep whatever text arrived before the abort; discarding it loses work the
    // model already did.
    setStreaming((current) => {
      if (current?.content) {
        setMessages((existing) => [
          ...existing,
          {
            id: `${STREAMING_ID}-${Date.now()}`,
            role: "ASSISTANT",
            content: `${current.content}\n\n_Stopped._`,
            citations: [],
            relatedFiles: [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      return null;
    });
  }, []);

  const send = useCallback(
    async (question) => {
      const text = question.trim();
      if (!text || streaming) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          role: "USER",
          content: text,
          citations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreaming({ content: "", chunks: [] });
      setError(null);

      try {
        await api.chat.ask(repositoryId, text, chatId, {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === "context") {
              if (data.chatId) setChatId(data.chatId);
              contextRef.current?.(data.chunks ?? []);
              setStreaming((current) =>
                current ? { ...current, chunks: data.chunks ?? [] } : current,
              );
              return;
            }

            if (event === "token") {
              setStreaming((current) =>
                current ? { ...current, content: current.content + data.value } : current,
              );
              return;
            }

            if (event === "done") {
              if (data.chatId) setChatId(data.chatId);
              setMessages((current) => [
                ...current,
                {
                  id: data.messageId,
                  role: "ASSISTANT",
                  content: data.content,
                  reasoning: data.reasoning,
                  confidence: data.confidence,
                  citations: data.citations ?? [],
                  relatedFiles: data.relatedFiles ?? [],
                  latencyMs: data.latencyMs,
                  createdAt: new Date().toISOString(),
                },
              ]);
              setStreaming(null);
              abortRef.current = null;
              return;
            }

            if (event === "error") {
              setError(new Error(data.message));
              setStreaming(null);
              abortRef.current = null;
            }
          },
        });
      } catch (caught) {
        // An abort is a user action, not a failure.
        if (caught.name !== "AbortError") {
          setError(caught);
          setStreaming(null);
        }
        abortRef.current = null;
      }
    },
    [repositoryId, chatId, streaming],
  );

  const clear = useCallback(async () => {
    if (!chatId) return;
    await api.chat.clear(chatId);
    setMessages([]);
    setStreaming(null);
  }, [chatId]);

  return {
    chatId,
    messages,
    streaming,
    loading,
    error,
    send,
    stop,
    clear,
    isStreaming: Boolean(streaming),
  };
}
