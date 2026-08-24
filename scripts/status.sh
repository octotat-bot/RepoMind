#!/usr/bin/env bash
# Report what is running, and whether the backend's dependencies are healthy.
#
#   scripts/status.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

report() {
  local label="$1" port="$2" pattern="$3" url="$4"
  local pid
  pid="$(port_pid "$port")"

  if [[ -z "$pid" ]]; then
    fail "$(printf '%-9s not running (port %s free)' "$label" "$port")"
    return
  fi

  if ! port_is_ours "$pid" "$pattern"; then
    warn "$(printf '%-9s port %s held by another process' "$label" "$port")"
    note "pid ${pid}: $(pid_command "$pid" | cut -c1-80)"
    return
  fi

  if http_ok "$url"; then
    ok "$(printf '%-9s %s  (pid %s)' "$label" "$url" "$pid")"
  else
    warn "$(printf '%-9s pid %s is up but %s is not answering' "$label" "$pid" "$url")"
  fi
}

step "Services"
report "Ollama"   "$OLLAMA_PORT"   "$OLLAMA_PATTERN"   "${OLLAMA_URL}/api/tags"
report "Backend"  "$BACKEND_PORT"  "$BACKEND_PATTERN"  "${BACKEND_URL}/api/v1/health"
report "Frontend" "$FRONTEND_PORT" "$FRONTEND_PATTERN" "$FRONTEND_URL"

# The readiness endpoint names anything misconfigured, which is more useful
# than a bare "running" line.
if http_ok "${BACKEND_URL}/api/v1/health"; then
  step "Dependencies"
  ready="$(curl -fsS --max-time 20 "${BACKEND_URL}/api/v1/health/ready" 2>/dev/null || echo '')"
  if [[ -z "$ready" ]]; then
    warn "Readiness check did not respond."
  else
    printf '%s' "$ready" | "$PROJECT_ROOT/backend/.venv/bin/python" -c '
import json, sys

data = json.load(sys.stdin)
checks = data.get("checks", {})

database = checks.get("database", {})
engine = database.get("engine", "?")
db_state = "ok" if database.get("ok") else "UNAVAILABLE"
print(f"  database  {engine}: {db_state}")

ollama = checks.get("ollama", {})
base_url = ollama.get("baseUrl", "?")
ollama_state = "ok" if ollama.get("ok") else "UNAVAILABLE"
chat_model = ollama.get("chatModel")
embed_model = ollama.get("embedModel")
print(f"  ollama    {base_url}: {ollama_state}")
print(f"  models    chat={chat_model} embed={embed_model}")

for model in ollama.get("missingModels") or []:
    print(f"  missing   {model}  ->  ollama pull {model}")

overall = data.get("status", "?")
print()
print(f"  overall   {overall}")
' || warn "Could not parse the readiness response."
  fi
fi

if [[ -d "$LOG_DIR" ]]; then
  step "Logs"
  info "$LOG_DIR"
fi

printf '\n'
