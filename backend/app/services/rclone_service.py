"""
rclone integration service.

rclone runs as a dedicated Docker service (rclone/rclone image) exposing the RC
(remote-control) HTTP API on port 5572. This backend uses the RC API for all
config/browse operations and subprocess only for:
  - OAuth authorize flow  (rclone authorize, needs :53682 on backend)
  - File streaming        (rclone cat, RC has no stream endpoint)

Config file is a shared Docker volume: backend at /app/data/rclone.conf,
rclone container at /data/rclone.conf — same file on the host.
"""

import configparser
import json
import os
import re
import subprocess
import threading
from pathlib import Path
from typing import Iterator

import httpx

RCLONE_CONFIG = "/app/data/rclone.conf"
RCLONE_BIN = "rclone"
RCLONE_RC_URL = os.getenv("RCLONE_RC_URL", "http://rclone:5572")

PROVIDERS = {
    "drive":    {"label": "Google Drive",       "oauth": True},
    "dropbox":  {"label": "Dropbox",            "oauth": True},
    "onedrive": {"label": "Microsoft OneDrive", "oauth": True},
    "box":      {"label": "Box",                "oauth": True},
    "mega":     {"label": "MEGA",               "oauth": False},
}

_auth_sessions: dict[str, "_AuthSession"] = {}


def _rc(endpoint: str, **payload) -> dict:
    """POST to the rclone RC API. Raises RuntimeError on failure."""
    try:
        resp = httpx.post(
            f"{RCLONE_RC_URL}/{endpoint}",
            json=payload or {},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.json().get("error", "")
        except Exception:
            pass
        raise RuntimeError(detail or str(e))
    except httpx.RequestError as e:
        raise RuntimeError(f"rclone daemon unreachable: {e}")


def _setup_rclone_dnat():
    """
    rclone authorize binds to 127.0.0.1:53682 (loopback only).
    Docker port-mapping delivers browser callbacks on eth0, not loopback.
    Fix: enable route_localnet + DNAT so eth0:53682 → 127.0.0.1:53682.
    """
    for path in [
        "/proc/sys/net/ipv4/conf/all/route_localnet",
        "/proc/sys/net/ipv4/conf/eth0/route_localnet",
    ]:
        try:
            Path(path).write_text("1\n")
        except Exception:
            pass
    try:
        check = subprocess.run(
            ["iptables", "-t", "nat", "-C", "PREROUTING",
             "-p", "tcp", "--dport", "53682",
             "-j", "DNAT", "--to-destination", "127.0.0.1:53682"],
            capture_output=True, timeout=5,
        )
        if check.returncode != 0:
            subprocess.run(
                ["iptables", "-t", "nat", "-I", "PREROUTING",
                 "-p", "tcp", "--dport", "53682",
                 "-j", "DNAT", "--to-destination", "127.0.0.1:53682"],
                capture_output=True, timeout=5,
            )
    except Exception:
        pass


def _kill_rclone_authorize():
    """Kill any lingering 'rclone authorize' processes in this container."""
    import os as _os, signal
    my_pid = _os.getpid()
    try:
        for pid_str in _os.listdir("/proc"):
            if not pid_str.isdigit() or int(pid_str) == my_pid:
                continue
            try:
                exe = _os.readlink(f"/proc/{pid_str}/exe")
                if not exe.endswith("rclone"):
                    continue
                args = open(f"/proc/{pid_str}/cmdline", "rb").read().split(b"\x00")
                if any(b"authorize" in a for a in args):
                    _os.kill(int(pid_str), signal.SIGKILL)
            except Exception:
                pass
    except Exception:
        pass


class _AuthSession:
    """Manages a single `rclone authorize` subprocess for OAuth."""

    def __init__(self, provider: str):
        self.provider = provider
        self.url: str | None = None
        self.token: str | None = None
        self.error: str | None = None
        self.done = False
        self._proc: subprocess.Popen | None = None

    def start(self):
        self._proc = subprocess.Popen(
            [RCLONE_BIN, "authorize", self.provider,
             "--auth-no-open-browser",
             "--config", RCLONE_CONFIG],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        url_re = re.compile(r"(https?://\S+)", re.I)
        buf = []
        for line in self._proc.stdout:
            buf.append(line)
            full = "".join(buf)
            if not self.url and ("following link" in line or "go to" in line.lower()):
                m = url_re.search(line)
                if m:
                    self.url = m.group(1).rstrip('."\')/,')
            if "--->" in full and "<---" in full:
                m = re.search(r"--->\s*(\{.*?\})\s*<---", full, re.DOTALL)
                if m:
                    self.token = m.group(1).strip()
                    self.done = True
                    # Kill immediately so port 53682 is released for the next auth
                    self.cancel()
                    return
        self._proc.wait()
        if not self.done:
            self.error = "Authorization did not complete."
            self.done = True

    def cancel(self):
        if self._proc:
            try:
                self._proc.terminate()
            except Exception:
                pass


class RcloneService:
    # ── OAuth (subprocess — RC has no authorize endpoint) ─────────────────────

    def start_auth(self, session_id: str, provider: str) -> str | None:
        """Start OAuth flow. Returns the auth URL once rclone outputs it."""
        _kill_rclone_authorize()
        import time
        time.sleep(0.5)
        _setup_rclone_dnat()
        for old in list(_auth_sessions.values()):
            old.cancel()
        _auth_sessions.clear()
        session = _AuthSession(provider)
        _auth_sessions[session_id] = session
        session.start()
        for _ in range(150):
            if session.url or session.done:
                break
            time.sleep(0.1)
        return session.url

    def poll_auth(self, session_id: str) -> dict:
        session = _auth_sessions.get(session_id)
        if not session:
            return {"done": True, "error": "Session not found"}
        return {
            "done": session.done,
            "url": session.url,
            "token": session.token,
            "error": session.error,
        }

    def finish_auth(self, session_id: str, remote_name: str, provider: str) -> bool:
        """After OAuth completes, persist the remote by writing directly to rclone.conf.
        Avoids spawning rclone subprocesses that would re-bind port 53682."""
        session = _auth_sessions.pop(session_id, None)
        if not session or not session.token:
            return False
        # Ensure the authorize subprocess is dead so port 53682 is free
        session.cancel()

        # Write directly to rclone.conf — no subprocess, no port conflicts
        try:
            cfg = configparser.RawConfigParser()
            cfg.read(RCLONE_CONFIG)
            cfg[remote_name] = {"type": provider, "token": session.token}
            with open(RCLONE_CONFIG, "w") as f:
                cfg.write(f)
            # Tell the RC daemon to reload so it picks up the new remote
            try:
                _rc("config/reload")
            except Exception:
                pass
            return True
        except Exception:
            return False

    # ── Remotes (RC API) ──────────────────────────────────────────────────────

    def list_remotes(self) -> list[dict]:
        try:
            result = _rc("config/listremotes")
            remotes = []
            for name in result.get("remotes", []):
                cfg = _rc("config/get", name=name)
                rtype = cfg.get("type", "")
                remotes.append({
                    "name": name,
                    "type": rtype,
                    "label": PROVIDERS.get(rtype, {}).get("label", rtype),
                })
            return remotes
        except Exception:
            return []

    def delete_remote(self, name: str) -> bool:
        try:
            _rc("config/delete", name=name)
            return True
        except Exception:
            return False

    def test_remote(self, name: str) -> dict:
        try:
            _rc("operations/list",
                fs=f"{name}:",
                remote="",
                opt={"maxDepth": 1, "noModTime": True})
            return {"ok": True}
        except RuntimeError as e:
            raise RuntimeError(str(e))

    # ── Browse (RC API) ───────────────────────────────────────────────────────

    def list_directory(self, remote: str, path: str) -> list[dict]:
        try:
            result = _rc("operations/list",
                         fs=f"{remote}:",
                         remote=path,
                         opt={"noModTime": True})
            items = result.get("list", [])
        except Exception:
            # Fallback to subprocess lsjson
            remote_path = f"{remote}:{path}"
            res = subprocess.run(
                [RCLONE_BIN, "--config", RCLONE_CONFIG,
                 "lsjson", "--no-modtime", remote_path],
                capture_output=True, text=True, timeout=30,
            )
            if res.returncode != 0:
                raise RuntimeError(res.stderr.strip() or f"Cannot list {remote_path}")
            items = json.loads(res.stdout or "[]")

        entries = []
        for item in items:
            entries.append({
                "name": item["Name"],
                "path": (path.rstrip("/") + "/" + item["Name"]).lstrip("/"),
                "is_dir": item.get("IsDir", False),
                "size": item.get("Size"),
            })
        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
        return entries

    # ── Download (subprocess — RC has no streaming endpoint) ─────────────────

    def stream_file(self, remote: str, path: str) -> Iterator[bytes]:
        remote_path = f"{remote}:{path}"
        proc = subprocess.Popen(
            [RCLONE_BIN, "--config", RCLONE_CONFIG, "cat", remote_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        def _gen():
            try:
                while True:
                    chunk = proc.stdout.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                proc.stdout.close()
                proc.wait()

        return _gen()


    def stream_folder_zip(self, remote: str, path: str) -> Iterator[bytes]:
        import os, shutil, tempfile, zipfile
        tmpdir = tempfile.mkdtemp(prefix="rclone_folder_")
        zip_path = tmpdir + ".zip"
        try:
            remote_path = f"{remote}:{path}"
            res = subprocess.run(
                [RCLONE_BIN, "--config", RCLONE_CONFIG, "copy", remote_path, tmpdir],
                capture_output=True,
                timeout=300,
            )
            if res.returncode != 0:
                raise RuntimeError(res.stderr.decode().strip() or f"Failed to copy {remote_path}")

            folder_name = path.rstrip("/").rsplit("/", 1)[-1] or remote
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for root, _dirs, files in os.walk(tmpdir):
                    for fn in files:
                        fp = os.path.join(root, fn)
                        arcname = folder_name + "/" + os.path.relpath(fp, tmpdir)
                        zf.write(fp, arcname)

            def _gen():
                try:
                    with open(zip_path, "rb") as f:
                        while True:
                            chunk = f.read(65536)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    shutil.rmtree(tmpdir, ignore_errors=True)
                    try:
                        os.unlink(zip_path)
                    except Exception:
                        pass

            return _gen()
        except Exception:
            shutil.rmtree(tmpdir, ignore_errors=True)
            try:
                os.unlink(zip_path)
            except Exception:
                pass
            raise


    def list_recursive_filtered(self, remote: str, path: str, extensions: list[str]) -> list[dict]:
        """Recursively list files under remote:path matching extensions.
        Uses subprocess lsjson directly — RC API returns ambiguous Path values."""
        import json as _json
        exts = {e.lower().lstrip(".") for e in extensions if e.strip()}
        remote_arg = f"{remote}:{path}" if path else f"{remote}:"
        res = subprocess.run(
            [RCLONE_BIN, "--config", RCLONE_CONFIG,
             "lsjson", "--recursive", "--no-modtime", "--files-only", remote_arg],
            capture_output=True, text=True, timeout=120,
        )
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or f"Cannot list {remote_arg}")
        items = _json.loads(res.stdout or "[]")
        # lsjson "Path" is always relative to the listing root (remote_arg)
        results = []
        for item in items:
            name = item.get("Name", "")
            rel  = item.get("Path", name)
            ext  = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if not exts or ext in exts:
                results.append({
                    "name": name,
                    "rel_path": rel,
                    "path": (path.rstrip("/") + "/" + rel).lstrip("/") if path else rel,
                    "size": item.get("Size"),
                })
        results.sort(key=lambda f: f["rel_path"].lower())
        return results

    def stream_zip_paths(self, remote: str, base_path: str, rel_paths: list[str]) -> Iterator[bytes]:
        """Stream selected files as a ZIP without buffering to disk.
        Uses a background thread + queue so the first bytes reach the client
        immediately — prevents nginx 504 on large/slow transfers."""
        import io, zipfile, threading, queue as _queue

        q: "_queue.Queue" = _queue.Queue(maxsize=16)
        _DONE = object()

        class _PipeBuffer(io.RawIOBase):
            def __init__(self):
                self._pos = 0
            def write(self, b: bytes) -> int:
                data = bytes(b)
                if data:
                    q.put(data)
                self._pos += len(data)
                return len(data)
            def tell(self) -> int:
                return self._pos
            def writable(self) -> bool:
                return True
            def seekable(self) -> bool:
                return False
            def readable(self) -> bool:
                return False

        def _worker():
            try:
                buf = _PipeBuffer()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for rel in rel_paths:
                        full = (base_path.rstrip("/") + "/" + rel).lstrip("/") if base_path else rel
                        info = zipfile.ZipInfo(rel.replace("\\", "/"))
                        info.compress_type = zipfile.ZIP_DEFLATED
                        proc = subprocess.Popen(
                            [RCLONE_BIN, "--config", RCLONE_CONFIG, "cat", f"{remote}:{full}"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        )
                        with zf.open(info, "w") as ze:
                            while True:
                                chunk = proc.stdout.read(65536)
                                if not chunk:
                                    break
                                ze.write(chunk)
                        proc.stdout.close()
                        proc.wait()
                        if proc.returncode != 0:
                            err = proc.stderr.read().decode().strip()
                            raise RuntimeError(err or f"rclone cat failed for {rel}")
            except Exception as exc:
                q.put(exc)
                return
            q.put(_DONE)

        threading.Thread(target=_worker, daemon=True).start()

        def _gen():
            while True:
                item = q.get()
                if item is _DONE:
                    return
                if isinstance(item, Exception):
                    raise item
                yield item

        return _gen()


rclone_service = RcloneService()
