"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TERMINAL_STATUSES } from "@/lib/constants";

/**
 * Subscribe to a repository's server-sent indexing stream.
 *
 * Returns the newest frame, or null before the first one arrives — callers fall
 * back to the repository record they already hold. The stream is torn down when
 * the pipeline settles and again on unmount, so no frame can land afterwards.
 *
 * @param {string} repositoryId
 * @param {{ enabled?: boolean, onSettled?: (frame: object) => void }} options
 */
export function useIndexProgress(repositoryId, { enabled = true, onSettled } = {}) {
  const [frame, setFrame] = useState(null);
  const [error, setError] = useState(null);
  const settledHandler = useRef(onSettled);
  settledHandler.current = onSettled;

  useEffect(() => {
    if (!enabled || !repositoryId) return undefined;

    const controller = new AbortController();
    let alive = true;

    setFrame(null);
    setError(null);

    api.repos
      .progress(repositoryId, {
        signal: controller.signal,
        onEvent: (name, data) => {
          if (!alive || name !== "progress" || !data) return;
          setFrame(data);
          if (TERMINAL_STATUSES.has(data.status)) {
            controller.abort();
            settledHandler.current?.(data);
          }
        },
      })
      .catch((caught) => {
        // Our own abort surfaces here too; that is a clean shutdown, not a fault.
        if (!alive || controller.signal.aborted) return;
        setError(caught);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [repositoryId, enabled]);

  return { frame, error };
}
