"""Launch a command in its own session so it outlives the calling shell.

macOS ships no ``setsid(1)``, and ``nohup`` only blocks SIGHUP — it leaves the
child in the shell's process group, so anything that signals that group still
takes the service down. Creating a new session is what actually detaches it.

    _daemonize.py <pidfile> <logfile> <workdir> <command> [args...]

The PID written to ``pidfile`` is the final process, and it is written before
this script returns, so the caller can read it immediately.
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    if len(sys.argv) < 5:
        sys.exit("usage: _daemonize.py <pidfile> <logfile> <workdir> <command> [args...]")

    pidfile, logfile, workdir, *command = sys.argv[1:]

    child = os.fork()
    if child > 0:
        # Wait for the intermediate child so the pidfile is guaranteed to exist
        # by the time the shell continues.
        os.waitpid(child, 0)
        return

    # ── Intermediate child ───────────────────────────────────────────────────
    os.setsid()  # new session, no controlling terminal, new process group

    grandchild = os.fork()
    if grandchild > 0:
        with open(pidfile, "w") as handle:
            handle.write(str(grandchild))
        os._exit(0)

    # ── The service itself ───────────────────────────────────────────────────
    try:
        os.chdir(workdir)

        with open(os.devnull, "rb") as devnull:
            os.dup2(devnull.fileno(), 0)
        with open(logfile, "ab") as log:
            os.dup2(log.fileno(), 1)
            os.dup2(log.fileno(), 2)

        os.execvp(command[0], command)
    except Exception as exc:  # noqa: BLE001 - must not return to the caller
        sys.stderr.write(f"failed to exec {command}: {exc}\n")
        os._exit(1)


if __name__ == "__main__":
    main()
