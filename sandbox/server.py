"""Code-execution sandbox: POST /run {code, timeout} -> stdout/stderr.

Runs model-generated Python in a fresh, isolated subprocess per request.
Defense layers (this process is assumed hostile):
- lives in its own container: no secrets in env, read-only rootfs (tmpfs /tmp),
  internal-only docker network (no internet), memory/pids/cpu capped
- per-run rlimits: address space, CPU seconds, file size, process count
- python -I (isolated mode), minimal env, own session killed as a group on
  timeout, output truncated

Stdlib only — no pip packages — to keep the attack surface tiny.
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_OUTPUT = 20_000
MAX_TIMEOUT = 30
MAX_BODY = 200_000


def set_limits():
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (MAX_TIMEOUT, MAX_TIMEOUT))
    resource.setrlimit(resource.RLIMIT_FSIZE, (5 * 1024 * 1024,) * 2)
    try:
        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    except (ValueError, OSError):
        pass


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, obj: dict):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quiet the default per-request noise
        pass

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "python": sys.version.split()[0],
                                    "max_timeout": MAX_TIMEOUT})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/run":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._json(413, {"error": "code too large"})
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            return self._json(400, {"error": "body must be JSON"})
        code = str(body.get("code") or "")
        if not code.strip():
            return self._json(400, {"error": "no code provided"})
        timeout = max(1, min(int(body.get("timeout") or 10), MAX_TIMEOUT))

        workdir = tempfile.mkdtemp(prefix="run-")
        started = time.monotonic()
        timed_out = False
        try:
            proc = subprocess.Popen(
                [sys.executable, "-I", "-c", code],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=workdir,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": workdir},
                start_new_session=True,
                preexec_fn=set_limits)
            try:
                out, err = proc.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                out, err = proc.communicate()
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

        self._json(200, {
            "exit_code": proc.returncode,
            "timed_out": timed_out,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "stdout": out.decode(errors="replace")[:MAX_OUTPUT],
            "stderr": err.decode(errors="replace")[:MAX_OUTPUT],
        })


if __name__ == "__main__":
    print(f"sandbox ready on :8080 (python {sys.version.split()[0]})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
