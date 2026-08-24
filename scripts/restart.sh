#!/usr/bin/env bash
# Stop and start again. Any arguments are forwarded to start.sh.
#
#   scripts/restart.sh
#   scripts/restart.sh --prod

HERE="$(dirname "${BASH_SOURCE[0]}")"

"$HERE/stop.sh"
# Give the kernel a moment to release the listening sockets, otherwise the
# rebind fails with "address already in use".
sleep 2
exec "$HERE/start.sh" "$@"
