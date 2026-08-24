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
import base64
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_OUTPUT = 20_000
MAX_TIMEOUT = 30
MAX_BODY = 40_000_000  # input files ride along as base64
MAX_INPUT_FILES = 8
MAX_OUTPUT_FILES = 3
MAX_OUTPUT_BYTES = 8_000_000

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]")


def set_limits():
    import resource
    # 1.5GB virtual: OpenBLAS (numpy) pre-allocates large address space even
    # for tiny arrays; resident memory stays capped by the container.
    resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024,) * 2)
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
        # Input files (e.g. the user's attachments) land in the working
        # directory by name; anything the program CREATES there comes back.
        for raw_name, b64 in list((body.get("files") or {}).items())[:MAX_INPUT_FILES]:
            name = _SAFE_NAME.sub("_", os.path.basename(str(raw_name)))[:100] or "file"
            try:
                with open(os.path.join(workdir, name), "wb") as f:
                    f.write(base64.b64decode(b64))
            except Exception:
                continue
        before = set(os.listdir(workdir))

        started = time.monotonic()
        timed_out = False
        try:
            proc = subprocess.Popen(
                [sys.executable, "-I", "-c", code],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=workdir,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": workdir,
                     # single-threaded BLAS: hugely less virtual memory, and
                     # the cpu quota is 1 core anyway
                     "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1",
                     "MKL_NUM_THREADS": "1"},
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

            # New files the program created come back to the caller.
            outputs = {}
            try:
                for name in sorted(os.listdir(workdir)):
                    if name in before or len(outputs) >= MAX_OUTPUT_FILES:
                        continue
                    path = os.path.join(workdir, name)
                    if not os.path.isfile(path) or os.path.getsize(path) > MAX_OUTPUT_BYTES:
                        continue
                    with open(path, "rb") as f:
                        outputs[name] = base64.b64encode(f.read()).decode()
            except Exception:
                pass
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

        self._json(200, {
            "exit_code": proc.returncode,
            "timed_out": timed_out,
            "duration_ms": int((time.monotonic() - started) * 1000),
            "stdout": out.decode(errors="replace")[:MAX_OUTPUT],
            "stderr": err.decode(errors="replace")[:MAX_OUTPUT],
            "files": outputs,
        })


if __name__ == "__main__":
    print(f"sandbox ready on :8080 (python {sys.version.split()[0]})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
