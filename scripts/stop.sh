#!/usr/bin/env bash
# Stop the RepoMind services.
#
#   scripts/stop.sh              # stop the frontend and backend
#   scripts/stop.sh --all        # also stop Ollama, if this script started it
#   scripts/stop.sh --clean      # additionally clear the frontend build cache
#
# Ollama is left running by default: it is commonly started outside this
# project, and stopping it would break whatever else is using it.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

STOP_OLLAMA=0
CLEAN=0

for arg in "$@"; do
  case "$arg" in
    --all)     STOP_OLLAMA=1 ;;
    --clean)   CLEAN=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         die "Unknown option: $arg (try --help)" ;;
  esac
done

step "Stopping services"

stop_service frontend "$FRONTEND_PORT" "$FRONTEND_PATTERN" "Frontend"
stop_service backend  "$BACKEND_PORT"  "$BACKEND_PATTERN"  "Backend"

if (( STOP_OLLAMA )); then
  # Only ours: if the PID file is gone, Ollama was already running when
  # start.sh ran, so it belongs to the user or the desktop app.
  ollama_pid="$(read_pid ollama)"
  if pid_alive "$ollama_pid"; then
    terminate_tree "$ollama_pid"
    clear_pid ollama
    ok "Ollama stopped."
  else
    clear_pid ollama
    info "Ollama was not started by these scripts; left running."
  fi
fi

if (( CLEAN )); then
  step "Clearing caches"
  rm -rf "$PROJECT_ROOT/frontend/.next"
  ok "Removed frontend/.next"
  note "The next dev start will recompile from scratch."
fi

printf '\n'
