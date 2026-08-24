#!/usr/bin/env bash
# Follow the service logs live, the way a foreground terminal would show them.
#
#   scripts/logs.sh                 # follow all three, prefixed by service
#   scripts/logs.sh backend         # follow one
#   scripts/logs.sh backend -n 200  # with more history
#   scripts/logs.sh --quiet         # hide SQL statement spam from DEBUG=true
#
# Ctrl-C stops watching. It does not stop the services.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

QUIET=0
SERVICE=""
TAIL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    backend|frontend|ollama) SERVICE="$1"; shift ;;
    --quiet|-q)              QUIET=1; shift ;;
    -n)                      TAIL_ARGS+=(-n "$2"); shift 2 ;;
    -h|--help)               sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)                       die "Unknown option: $1 (try --help)" ;;
  esac
done

[[ ${#TAIL_ARGS[@]} -gt 0 ]] || TAIL_ARGS=(-n 40)

[[ -d "$LOG_DIR" ]] || die "No logs yet. Start the services with scripts/start.sh"

# SQLAlchemy echoes every statement when DEBUG=true, which drowns out anything
# worth reading. This strips those lines without changing what is on disk.
#
# --line-buffered is essential: grep block-buffers when its output is a pipe,
# so without it a followed log appears to hang until several KB have built up.
noise_filter() {
  if (( QUIET )); then
    grep --line-buffered -vE "aiosqlite|asyncpg|sqlalchemy\.engine|DEBUG " || true
  else
    cat
  fi
}

if [[ -n "$SERVICE" ]]; then
  file="$LOG_DIR/$SERVICE.log"
  [[ -f "$file" ]] || die "No log for '$SERVICE' at $file"
  info "Following $file — Ctrl-C to stop watching (services keep running)"
  printf '\n'
  tail -f "${TAIL_ARGS[@]}" "$file" | noise_filter
  exit 0
fi

files=()
for name in backend frontend ollama; do
  [[ -f "$LOG_DIR/$name.log" ]] && files+=("$LOG_DIR/$name.log")
done
(( ${#files[@]} )) || die "No log files in $LOG_DIR"

info "Following ${#files[@]} logs — Ctrl-C to stop watching (services keep running)"
printf '\n'

# tail -f over several files prints "==> path <==" headers when the active file
# changes, which is the labelling we want; just make it readable.
tail -f "${TAIL_ARGS[@]}" "${files[@]}" \
  | sed -u "s|^==> .*/\([a-z]*\)\.log <==|${BOLD}── \1 ──${RESET}|" \
  | noise_filter
