/**
 * Typed-ish client for the RepoMind API.
 *
 * Handles token storage, transparent refresh on 401, and normalises the
 * backend's `{ error: { code, message } }` envelope into a thrown ApiError so
 * callers only ever deal with one failure shape.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000/api/v1";

const ACCESS_KEY = "repomind.access";
const REFRESH_KEY = "repomind.refresh";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ── Token storage ────────────────────────────────────────────────────────── */

const isBrowser = () => typeof window !== "undefined";

export const tokens = {
  access: () => (isBrowser() ? localStorage.getItem(ACCESS_KEY) : null),
  refresh: () => (isBrowser() ? localStorage.getItem(REFRESH_KEY) : null),
  save({ accessToken, refreshToken }) {
    if (!isBrowser()) return;
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    if (!isBrowser()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/* ── Refresh coordination ─────────────────────────────────────────────────── */

// Concurrent 401s must trigger exactly one refresh, not one per request.
let refreshInFlight = null;
let onUnauthorized = null;

/** Register a callback invoked when the session is unrecoverable. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function refreshSession() {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      tokens.save(data.tokens);
      return true;
    } catch {
      return false;
    } finally {
      // Release the lock on the next tick so racers observe the result first.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

function authHeaders(extra = {}) {
  const token = tokens.access();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function toApiError(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const error = payload?.error;
  return new ApiError(error?.message ?? `Request failed (${response.status})`, {
    status: response.status,
    code: error?.code ?? "http_error",
    details: error?.details,
  });
}

/* ── Core request ─────────────────────────────────────────────────────────── */

/* ── Cold-start awareness ─────────────────────────────────────────────────── */

// Free hosting tiers sleep after idle and take up to a minute to wake, during
// which connections are refused. Without this the app just looks broken, so
// slow or refused requests are surfaced as "waking" rather than "failed".
const SLOW_REQUEST_MS = 3500;
const WAKE_RETRIES = 4;
const WAKE_BACKOFF_MS = 3000;

const wakeListeners = new Set();
let wakeState = "idle"; // idle | waking

/** Subscribe to backend wake state. Returns an unsubscribe function. */
export function onBackendWake(listener) {
  wakeListeners.add(listener);
  listener(wakeState);
  return () => wakeListeners.delete(listener);
}

function setWakeState(next) {
  if (wakeState === next) return;
  wakeState = next;
  for (const listener of wakeListeners) listener(next);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch` rejects with a bare "Failed to fetch" when the API is unreachable,
 * which tells a user nothing. Name the actual problem, and wait out a server
 * that is merely asleep.
 *
 * Only idempotent requests are retried: a rejected `fetch` means no response
 * arrived, not that the server never received the request, so replaying a POST
 * could duplicate a signup or an import.
 */
async function send(url, init, { streaming = false } = {}) {
  const method = (init?.method ?? "GET").toUpperCase();
  // A streaming response stays open for as long as the work takes — minutes,
  // for an index — so elapsed time says nothing about whether the server is
  // asleep. Only its connection failing does.
  const retryable = !streaming && (method === "GET" || method === "HEAD");
  const slowTimer = streaming
    ? null
    : setTimeout(() => setWakeState("waking"), SLOW_REQUEST_MS);

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch(url, init);
        setWakeState("idle");
        return response;
      } catch (caught) {
        if (caught?.name === "AbortError") throw caught;

        if (!retryable || attempt >= WAKE_RETRIES) {
          // A CORS rejection and an unreachable server are indistinguishable
          // here: the browser gives JavaScript the same opaque failure for
          // both. Naming both beats guessing at one.
          throw new ApiError(
            `Could not reach the RepoMind API at ${BASE_URL}. ` +
              "Either it is still starting up, or it is not allowing requests " +
              "from this site — check CORS_ORIGINS on the API.",
            { code: "network_error" },
          );
        }

        setWakeState("waking");
        await sleep(WAKE_BACKOFF_MS * (attempt + 1));
      }
    }
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
  }
}

async function request(path, { method = "GET", body, retry = true, signal } = {}) {
  const response = await send(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retry && tokens.refresh()) {
    if (await refreshSession()) {
      return request(path, { method, body, retry: false, signal });
    }
    tokens.clear();
    onUnauthorized?.();
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

/* ── Server-Sent Events over fetch ────────────────────────────────────────── */

/**
 * Consume an SSE endpoint, invoking `onEvent(name, data)` per frame.
 *
 * `fetch` is used rather than `EventSource` because EventSource cannot send an
 * Authorization header or a request body.
 */
export async function streamEvents(
  path,
  { method = "GET", body, onEvent, signal, retry = true } = {},
) {
  const response = await send(
    `${BASE_URL}${path}`,
    {
      method,
      signal,
      headers: authHeaders({
        Accept: "text/event-stream",
        ...(body ? { "Content-Type": "application/json" } : {}),
      }),
      body: body ? JSON.stringify(body) : undefined,
    },
    { streaming: true },
  );

  if (response.status === 401 && retry && tokens.refresh()) {
    if (await refreshSession()) {
      return streamEvents(path, { method, body, onEvent, signal, retry: false });
    }
    tokens.clear();
    onUnauthorized?.();
  }

  if (!response.ok) throw await toApiError(response);
  if (!response.body) throw new ApiError("Streaming is not supported by this browser.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; keep any partial tail buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let eventName = "message";
      const dataLines = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        onEvent?.(eventName, JSON.parse(dataLines.join("\n")));
      } catch {
        // A malformed frame must not tear down an otherwise healthy stream.
      }
    }
  }
}

/* ── Endpoints ────────────────────────────────────────────────────────────── */

export const api = {
  auth: {
    register: (body) => request("/auth/register", { method: "POST", body }),
    login: (body) => request("/auth/login", { method: "POST", body }),
    me: () => request("/auth/me"),
    updateProfile: (body) => request("/auth/me", { method: "PATCH", body }),
    changePassword: (body) => request("/auth/change-password", { method: "POST", body }),
  },

  repos: {
    list: () => request("/repo"),
    get: (id) => request(`/repo/${id}`),
    import: (url, force = false) => request("/repo/import", { method: "POST", body: { url, force } }),
    remove: (id) => request(`/repo/${id}`, { method: "DELETE" }),
    reindex: (id) => request(`/repo/${id}/reindex`, { method: "POST" }),
    files: (id) => request(`/repo/${id}/files`),
    file: (id, path) => request(`/repo/${id}/file?path=${encodeURIComponent(path)}`),
    search: (id, query, limit = 12, groupByFile = true) =>
      request(
        `/repo/${id}/search?q=${encodeURIComponent(query)}&limit=${limit}&groupByFile=${groupByFile}`,
      ),
    architecture: (id) => request(`/architecture/${id}`),
    deadCode: (id) => request(`/repo/${id}/dead-code`),
    progress: (id, { onEvent, signal }) =>
      streamEvents(`/repo/${id}/progress`, { onEvent, signal }),
  },

  chat: {
    conversation: (repoId, chatId) =>
      request(`/repo/${repoId}/chat${chatId ? `?chatId=${chatId}` : ""}`),
    list: (repoId) => request(`/repo/${repoId}/chats`),
    history: () => request("/chat/history"),
    remove: (chatId) => request(`/chat/${chatId}`, { method: "DELETE" }),
    clear: (chatId) => request(`/chat/${chatId}/clear`, { method: "POST" }),
    // Fetched rather than linked: a plain <a href> cannot carry the bearer token.
    exportMarkdown: (chatId) => request(`/chat/${chatId}/export`),
    ask: (repoId, message, chatId, { onEvent, signal }) =>
      streamEvents(`/repo/${repoId}/chat`, {
        method: "POST",
        body: { message, chatId },
        onEvent,
        signal,
      }),
  },

  system: {
    health: () => request("/health/ready"),
  },
};

export { BASE_URL };
