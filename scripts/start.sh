#!/usr/bin/env bash
# Start every RepoMind service: Ollama, the FastAPI backend, the Next.js app.
#
#   scripts/start.sh              # start everything that is not already up
#   scripts/start.sh --no-ollama  # leave Ollama alone (e.g. remote instance)
#   scripts/start.sh --prod       # serve a production frontend build
#
# Safe to re-run: anything already listening is left alone.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MANAGE_OLLAMA=1
PROD=0

for arg in "$@"; do
  case "$arg" in
    --no-ollama) MANAGE_OLLAMA=0 ;;
    --prod)      PROD=1 ;;
    -h|--help)   sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           die "Unknown option: $arg (try --help)" ;;
  esac
done

mkdir -p "$LOG_DIR"

# ── Preflight ────────────────────────────────────────────────────────────────
step "Checking prerequisites"

[[ -x "$PROJECT_ROOT/backend/.venv/bin/uvicorn" ]] ||
  die "Backend virtualenv missing. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
ok "Backend virtualenv"

[[ -d "$PROJECT_ROOT/frontend/node_modules" ]] ||
  die "Frontend dependencies missing. Run: cd frontend && npm install"
ok "Frontend dependencies"

[[ -f "$PROJECT_ROOT/backend/.env" ]] ||
  warn "backend/.env not found — falling back to defaults. Copy backend/.env.example and set JWT_SECRET."

# ── Ollama ───────────────────────────────────────────────────────────────────
step "Ollama"

if http_ok "${OLLAMA_URL}/api/tags"; then
  ok "Already running on port ${OLLAMA_PORT}."
  # Do not stop something we did not start.
  clear_pid ollama
elif (( MANAGE_OLLAMA == 0 )); then
  warn "Not running, and --no-ollama was passed. The backend will fail to embed."
else
  command -v ollama >/dev/null 2>&1 ||
    die "Ollama is not installed. See https://ollama.com/download"

  start_detached ollama "$LOG_DIR/ollama.log" "$PROJECT_ROOT" ollama serve
  if wait_for_http "${OLLAMA_URL}/api/tags" "Ollama" 30; then
    ok "Started on port ${OLLAMA_PORT}."
  else
    die "Ollama did not come up. See $LOG_DIR/ollama.log"
  fi
fi

# Warn early about missing models rather than at the first failed import.
if http_ok "${OLLAMA_URL}/api/tags"; then
  installed="$(curl -fsS --max-time 5 "${OLLAMA_URL}/api/tags" 2>/dev/null || echo '')"
  for model in nomic-embed-text llama3.2; do
    [[ "$installed" == *"$model"* ]] || warn "Model '${model}' is not pulled. Run: ollama pull ${model}"
  done
fi

# ── Backend ──────────────────────────────────────────────────────────────────
step "Backend"

existing="$(port_pid "$BACKEND_PORT")"
if [[ -n "$existing" ]]; then
  if port_is_ours "$existing" "$BACKEND_PATTERN"; then
    ok "Already running on port ${BACKEND_PORT}."
    save_pid backend "$existing"
  else
    fail "Port ${BACKEND_PORT} is taken by something else."
    note "pid ${existing}: $(pid_command "$existing" | cut -c1-90)"
    note "Free the port, or set REPOMIND_BACKEND_PORT to use another one."
    exit 1
  fi
else
  start_detached backend "$LOG_DIR/backend.log" "$PROJECT_ROOT/backend" \
    .venv/bin/uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT" --log-level info

  if wait_for_http "${BACKEND_URL}/api/v1/health" "the backend" 60; then
    ok "Started on ${BACKEND_URL}"
  else
    fail "Backend did not become healthy. Last lines:"
    tail -n 15 "$LOG_DIR/backend.log" | sed 's/^/      /'
    exit 1
  fi
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
step "Frontend"

existing="$(port_pid "$FRONTEND_PORT")"
if [[ -n "$existing" ]]; then
  if port_is_ours "$existing" "$FRONTEND_PATTERN"; then
    ok "Already running on port ${FRONTEND_PORT}."
    save_pid frontend "$existing"
  else
    fail "Port ${FRONTEND_PORT} is taken by something else."
    note "pid ${existing}: $(pid_command "$existing" | cut -c1-90)"
    exit 1
  fi
else
  if (( PROD )); then
    info "Building for production…"
    ( cd "$PROJECT_ROOT/frontend" && npm run build ) > "$LOG_DIR/frontend-build.log" 2>&1 ||
      { fail "Build failed. See $LOG_DIR/frontend-build.log"; exit 1; }
    ok "Build complete."
    start_cmd=(npm run start -- --port "$FRONTEND_PORT")
  else
    start_cmd=(npm run dev -- --port "$FRONTEND_PORT")
  fi

  start_detached frontend "$LOG_DIR/frontend.log" "$PROJECT_ROOT/frontend" "${start_cmd[@]}"

  # The first dev compile is slow on a cold .next cache.
  if wait_for_http "$FRONTEND_URL" "the frontend" 120; then
    ok "Started on ${FRONTEND_URL}"
  else
    fail "Frontend did not respond. Last lines:"
    tail -n 15 "$LOG_DIR/frontend.log" | sed 's/^/      /'
    exit 1
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
step "RepoMind is up"
info "App       ${FRONTEND_URL}"
info "API       ${BACKEND_URL}/api/v1"
info "API docs  ${BACKEND_URL}/docs"
info "Logs      ${LOG_DIR}"
printf '\n'
info "Stop with: scripts/stop.sh"
printf '\n'
