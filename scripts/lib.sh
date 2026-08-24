#!/usr/bin/env bash
# Shared helpers for the RepoMind service scripts.
#
# Sourced by start.sh / stop.sh / status.sh — not meant to be run directly.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$PROJECT_ROOT/.run"
LOG_DIR="$RUN_DIR/logs"

BACKEND_PORT="${REPOMIND_BACKEND_PORT:-8000}"
FRONTEND_PORT="${REPOMIND_FRONTEND_PORT:-3000}"
OLLAMA_PORT="${REPOMIND_OLLAMA_PORT:-11434}"

BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
OLLAMA_URL="http://127.0.0.1:${OLLAMA_PORT}"

# Command fragments that identify a process as ours. Used before killing
# anything found on a port, so an unrelated app that happens to be listening
# there is reported rather than terminated.
BACKEND_PATTERN="uvicorn main:app"
FRONTEND_PATTERN="next"
OLLAMA_PATTERN="ollama"

# Used only to run the detaching launcher. Prefer the project venv, which
# start.sh already requires, and fall back to the system interpreter.
if [[ -x "$PROJECT_ROOT/backend/.venv/bin/python" ]]; then
  PYTHON_BIN="$PROJECT_ROOT/backend/.venv/bin/python"
else
  PYTHON_BIN="$(command -v python3 || true)"
fi

if [[ -t 1 ]]; then
  DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  DIM=""; RED=""; GREEN=""; YELLOW=""; BOLD=""; RESET=""
fi

info()  { printf '  %s\n' "$*"; }
step()  { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*"; }
note()  { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }

die() { fail "$*"; exit 1; }

# ── Ports and processes ──────────────────────────────────────────────────────

# PID of whatever is listening on a TCP port, if anything.
port_pid() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
}

# Full command line for a PID, for identifying who owns a port.
pid_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

# True when the process on this port looks like the service we manage.
port_is_ours() {
  local pid="$1" pattern="$2"
  [[ -n "$pid" ]] && [[ "$(pid_command "$pid")" == *"$pattern"* ]]
}

http_ok() {
  curl -fsS -o /dev/null --max-time "${2:-5}" "$1" 2>/dev/null
}

# Poll a URL until it answers or the timeout expires.
wait_for_http() {
  local url="$1" label="$2" timeout="${3:-60}" waited=0
  while (( waited < timeout )); do
    if http_ok "$url" 3; then
      return 0
    fi
    sleep 1
    (( waited += 1 ))
    # Reassure the user during the slow first Next.js compile.
    if (( waited % 10 == 0 )); then
      note "still waiting for ${label} (${waited}s)…"
    fi
  done
  return 1
}

# ── Launching ────────────────────────────────────────────────────────────────

# Start a service in its own session and record its PID.
#
# Delegated to _daemonize.py because the service must survive this script
# exiting and the terminal closing. See that file for why nohup is not enough.
#
#   start_detached <name> <logfile> <working-dir> <command...>
start_detached() {
  local name="$1" logfile="$2" workdir="$3"
  shift 3

  mkdir -p "$(dirname "$logfile")" "$RUN_DIR"
  "$PYTHON_BIN" "$PROJECT_ROOT/scripts/_daemonize.py" \
    "$(pid_file "$name")" "$logfile" "$workdir" "$@"
}

# ── PID files ────────────────────────────────────────────────────────────────

pid_file() { printf '%s/%s.pid' "$RUN_DIR" "$1"; }

save_pid() {
  mkdir -p "$RUN_DIR"
  printf '%s' "$2" > "$(pid_file "$1")"
}

read_pid() {
  local file
  file="$(pid_file "$1")"
  [[ -f "$file" ]] && cat "$file" || true
}

clear_pid() { rm -f "$(pid_file "$1")"; }

pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# ── Stopping ─────────────────────────────────────────────────────────────────

# Terminate a PID and its children, escalating to SIGKILL only if needed.
# `npm run dev` spawns a child next-server, so the children must go first or
# they are re-parented and keep holding the port.
terminate_tree() {
  local pid="$1" waited=0
  pid_alive "$pid" || return 0

  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true

  while (( waited < 10 )) && pid_alive "$pid"; do
    sleep 1
    (( waited += 1 ))
  done

  if pid_alive "$pid"; then
    pkill -KILL -P "$pid" 2>/dev/null || true
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi
}

# Stop a service by its PID file, then sweep the port in case the recorded PID
# was stale (a manual restart, a crash, a previous session).
stop_service() {
  local name="$1" port="$2" pattern="$3" label="$4"
  local stopped=0 pid

  pid="$(read_pid "$name")"
  if pid_alive "$pid"; then
    terminate_tree "$pid"
    stopped=1
  fi
  clear_pid "$name"

  pid="$(port_pid "$port")"
  if [[ -n "$pid" ]]; then
    if port_is_ours "$pid" "$pattern"; then
      terminate_tree "$pid"
      stopped=1
    else
      warn "Port ${port} is held by a process that is not ${label}; left running."
      note "pid ${pid}: $(pid_command "$pid" | cut -c1-90)"
      return 0
    fi
  fi

  if (( stopped )); then
    ok "${label} stopped."
  else
    info "${label} was not running."
  fi
}
