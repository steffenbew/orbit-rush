#!/usr/bin/env python3
"""Foreground static server with checkout-local start/stop tracking."""

import errno
import fcntl
import functools
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parent.parent
STATE_DIR = ROOT / ".run"
STATE = STATE_DIR / "server.json"


def identity(pid):
    if not isinstance(pid, int) or pid <= 1:
        return None
    result = subprocess.run(
        ["ps", "-ww", "-p", str(pid), "-o", "lstart=", "-o", "command="],
        capture_output=True, text=True, env={**os.environ, "LC_ALL": "C"},
    )
    return result.stdout.strip() if result.returncode == 0 else None


def read_state():
    try:
        return json.loads(STATE.read_text())
    except FileNotFoundError:
        return None


class DevRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Keep HTML and modules in sync while editing; stale translations can stop the game loop.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def start():
    override = os.environ.get("PORT", "")
    if override and (not override.isascii() or not override.isdigit() or not 1 <= int(override) <= 65535):
        raise ValueError("PORT must be an integer between 1 and 65535.")
    port = int(override) if override else 8080
    handler = functools.partial(DevRequestHandler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as error:
        if override or error.errno != errno.EADDRINUSE:
            raise
        # Bind the actual server to a free port; no probe/release race.
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)

    with server:
        temporary = STATE.with_suffix(".tmp")
        try:
            record = {
                "pid": os.getpid(), "identity": identity(os.getpid()),
                "url": f"http://localhost:{server.server_port}",
            }
            temporary.write_text(json.dumps(record) + "\n")
            temporary.replace(STATE)
            print(f"Orbit Rush: {record['url']}\nStop with Ctrl+C or ./run stop in another terminal.", flush=True)
            server.serve_forever()
        finally:
            STATE.unlink(missing_ok=True)
            temporary.unlink(missing_ok=True)


def stop(record):
    pid = record.get("pid")
    current = identity(pid)
    # Check both birth time and command: a stale/recycled PID must never stop another app.
    if not current or current != record.get("identity") or not current.endswith(f"{SCRIPT} start"):
        raise RuntimeError("Refusing to stop: the tracked process is not this checkout's server.")
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    for _ in range(50):
        if identity(pid) != current:
            print("Stopped Orbit Rush.")
            return
        time.sleep(.1)
    raise RuntimeError("The server did not stop within five seconds.")


def interrupt(signum, frame):
    raise KeyboardInterrupt


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("start", "stop"):
        raise ValueError("Use ./run start or ./run stop.")
    STATE_DIR.mkdir(exist_ok=True)
    # Keep this lock file in place: unlinking it could allow two servers to start.
    with (STATE_DIR / "server.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            record = read_state()
            if not record:
                raise RuntimeError("The server is still starting; try again in a moment.")
            if sys.argv[1] == "stop":
                stop(record)
            else:
                print(f"Orbit Rush is already running: {record['url']}")
            return

        # No live server holds the lock; discard any stale record left by a crash.
        STATE.unlink(missing_ok=True)
        if sys.argv[1] == "stop":
            print("No Orbit Rush server running in this checkout.")
            return
        for name in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(name, interrupt)
        start()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError, RuntimeError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
