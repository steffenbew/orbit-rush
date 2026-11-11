#!/usr/bin/env python3
"""Exercise ./run against temporary checkouts, never the real development server."""

import errno
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


class DevServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="orbit rush run ")
        self.root = self.checkout("first checkout")
        self.processes = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if process.stdout:
                process.stdout.close()
        self.temporary.cleanup()

    def checkout(self, name):
        root = Path(self.temporary.name) / name
        (root / "scripts").mkdir(parents=True)
        shutil.copy2(ROOT / "run", root / "run")
        shutil.copy2(ROOT / "scripts/dev-server.py", root / "scripts/dev-server.py")
        (root / "index.html").write_text("<title>Orbit Rush test</title>")
        (root / "module.js").write_text("export const test = true;\n")
        return root

    def environment(self, port=None):
        env = dict(os.environ)
        env.pop("PORT", None)
        if port is not None:
            env["PORT"] = str(port)
        return env

    def command(self, command, root=None, port=None):
        return subprocess.run(
            [str((root or self.root) / "run"), command], cwd=self.temporary.name,
            env=self.environment(port), capture_output=True, text=True, timeout=10,
        )

    def launch(self, root=None, port=None, command="start"):
        root = root or self.root
        process = subprocess.Popen(
            [str(root / "run"), command], cwd=self.temporary.name,
            env=self.environment(port), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, start_new_session=True,
        )
        self.processes.append(process)
        for _ in range(100):
            if process.poll() is not None:
                self.fail(process.communicate()[0])
            state = root / ".run/server.json"
            if state.exists():
                record = json.loads(state.read_text())
                if record["pid"] == process.pid:
                    with urllib.request.urlopen(record["url"], timeout=2) as response:
                        self.assertIn(b"Orbit Rush test", response.read())
                    return process, record
            time.sleep(.05)
        self.fail("Server did not become ready")

    def assert_stopped(self, process, root=None):
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertFalse(((root or self.root) / ".run/server.json").exists())

    def test_default_port_duplicate_start_and_stop(self):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", 8080))
                preferred_free = True
            except OSError as error:
                self.assertEqual(error.errno, errno.EADDRINUSE)
                preferred_free = False
        process, record = self.launch()
        self.assertEqual(record["url"].endswith(":8080"), preferred_free)
        with urllib.request.urlopen(record["url"] + "/module.js") as response:
            self.assertIn("javascript", response.headers["Content-Type"])
        repeated = self.command("start")
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertIn(record["url"], repeated.stdout)
        self.assertEqual(json.loads((self.root / ".run/server.json").read_text())["pid"], process.pid)
        # Stop follows the record, not the current PORT environment variable.
        stopped = self.command("stop", port=65535)
        self.assertEqual(stopped.returncode, 0, stopped.stderr)
        self.assert_stopped(process)
        self.assertEqual(self.command("stop").returncode, 0)

    def test_busy_default_falls_back_without_touching_listener(self):
        with socket.socket() as occupied:
            occupied.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                occupied.bind(("127.0.0.1", 8080))
                occupied.listen()
            except OSError as error:
                self.assertEqual(error.errno, errno.EADDRINUSE)
            process, record = self.launch()
            self.assertFalse(record["url"].endswith(":8080"))
            stopped = self.command("stop")
            self.assertEqual(stopped.returncode, 0, stopped.stderr)
            self.assert_stopped(process)
            # Whether owned by this test or another app, the listener is still there.
            with socket.create_connection(("127.0.0.1", 8080), timeout=1):
                pass

    def test_custom_port_busy_port_and_invalid_values(self):
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            port = reserved.getsockname()[1]
            reserved.listen()
            failed = self.command("start", port=port)
            self.assertNotEqual(failed.returncode, 0)
            self.assertFalse((self.root / ".run/server.json").exists())
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                pass
        process, record = self.launch(port=port, command="dev")
        self.assertEqual(record["url"], f"http://localhost:{port}")
        process.send_signal(signal.SIGINT)
        self.assert_stopped(process)
        for invalid in ("bad", "0", "-1", "65536", "1.5"):
            failed = self.command("start", port=invalid)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("PORT must be", failed.stderr)

    def test_checkout_isolation(self):
        second = self.checkout("second checkout")
        first_process, first_record = self.launch()
        second_process, second_record = self.launch(root=second)
        self.assertNotEqual(first_record["url"], second_record["url"])
        self.assertEqual(self.command("stop").returncode, 0)
        self.assert_stopped(first_process)
        self.assertIsNone(second_process.poll())
        with urllib.request.urlopen(second_record["url"]) as response:
            self.assertEqual(response.status, 200)
        self.assertEqual(self.command("stop", root=second).returncode, 0)
        self.assert_stopped(second_process, root=second)

    def test_stale_record_recovery(self):
        process, record = self.launch()
        process.kill()
        process.wait(timeout=5)
        self.assertTrue((self.root / ".run/server.json").exists())
        replacement, new_record = self.launch()
        self.assertNotEqual(record["pid"], new_record["pid"])
        replacement.send_signal(signal.SIGINT)
        self.assert_stopped(replacement)
        (self.root / ".run/server.json").write_text(json.dumps(record))
        self.assertEqual(self.command("stop").returncode, 0)
        self.assertFalse((self.root / ".run/server.json").exists())

    def test_stop_refuses_unrelated_or_recycled_process(self):
        server, record = self.launch()
        unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        self.processes.append(unrelated)
        state = self.root / ".run/server.json"
        unrelated_identity = subprocess.run(
            ["ps", "-ww", "-p", str(unrelated.pid), "-o", "lstart=", "-o", "command="],
            capture_output=True, text=True, check=True, env={**os.environ, "LC_ALL": "C"},
        ).stdout.strip()
        try:
            for invalid in (
                {**record, "pid": unrelated.pid, "identity": unrelated_identity},
                {**record, "identity": "an earlier process with the same PID"},
            ):
                state.write_text(json.dumps(invalid))
                result = self.command("stop")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Refusing to stop", result.stderr)
                self.assertIsNone(unrelated.poll())
                self.assertIsNone(server.poll())
        finally:
            state.write_text(json.dumps(record))
        self.assertEqual(self.command("stop").returncode, 0)
        self.assert_stopped(server)
        self.assertIsNone(unrelated.poll())


if __name__ == "__main__":
    unittest.main(verbosity=2)
