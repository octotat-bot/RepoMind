"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Bind a keyboard shortcut.
 *
 * @param {string} key         Key to match, case-insensitive (e.g. "k").
 * @param {Function} handler   Invoked with the event when matched.
 * @param {object} options     { meta, shift, alt, allowInInput, enabled }
 */
export function useKeyboardShortcut(key, handler, options = {}) {
  const {
    meta = false,
    shift = false,
    alt = false,
    allowInInput = false,
    enabled = true,
  } = options;

  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      if (event.key?.toLowerCase() !== key.toLowerCase()) return;
      // Treat Cmd (macOS) and Ctrl (elsewhere) as the same modifier.
      if (meta !== (event.metaKey || event.ctrlKey)) return;
      if (shift !== event.shiftKey) return;
      if (alt !== event.altKey) return;

      if (!allowInInput) {
        const target = event.target;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      }

      event.preventDefault();
      savedHandler.current?.(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, meta, shift, alt, allowInInput, enabled]);
}

/** Fetch-on-mount helper with loading/error state and a manual refetch. */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (mounted.current) setData(result);
      return result;
    } catch (caught) {
      if (mounted.current) setError(caught);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) run();
  }, [run, immediate]);

  return { data, error, loading, refetch: run, setData };
}

/** Debounce a rapidly-changing value (search inputs). */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Persist a JSON-serialisable value in localStorage. */
export function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(initialValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setStored(JSON.parse(raw));
    } catch {
      // Corrupt or unavailable storage — fall back to the initial value.
    }
  }, [key]);

  const update = useCallback(
    (value) => {
      setStored((previous) => {
        const next = value instanceof Function ? value(previous) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Quota exceeded or private mode; state still updates in memory.
        }
        return next;
      });
    },
    [key],
  );

  return [stored, update];
}

/** True once the component has mounted — guards browser-only rendering. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
