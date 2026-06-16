import io
import stat as stat_module
from typing import Iterator
from app.models.config import SSHConfig

_DVC_PATH_PATTERNS = [
    lambda base, m: f"{base}/files/md5/{m[:2]}/{m[2:]}",
    lambda base, m: f"{base}/{m[:2]}/{m[2:]}",
]


class SSHService:
    def _make_client(self, cfg: SSHConfig):
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        connect_kwargs: dict = dict(
            hostname=cfg.host,
            port=cfg.port,
            username=cfg.username,
            timeout=15,
        )
        if cfg.private_key_pem:
            pkey = paramiko.RSAKey.from_private_key(io.StringIO(cfg.private_key_pem))
            connect_kwargs["pkey"] = pkey
            connect_kwargs["look_for_keys"] = False
        elif cfg.password:
            connect_kwargs["password"] = cfg.password
            connect_kwargs["look_for_keys"] = False
        client.connect(**connect_kwargs)
        return client

    def test_connection(self, cfg: SSHConfig) -> dict:
        try:
            client = self._make_client(cfg)
            _, stdout, _ = client.exec_command("echo ok")
            result = stdout.read().decode().strip()
            client.close()
            return {"ok": result == "ok", "host": cfg.host}
        except Exception as e:
            raise RuntimeError(str(e))

    def _detect_remote_path(self, sftp, cfg: SSHConfig, md5: str) -> str | None:
        base = cfg.remote_path.rstrip("/")
        for pattern in _DVC_PATH_PATTERNS:
            path = pattern(base, md5)
            try:
                sftp.stat(path)
                return path
            except FileNotFoundError:
                continue
            except Exception:
                continue
        return None

    def stream_file(self, cfg: SSHConfig, md5: str) -> tuple[Iterator[bytes], int]:
        """Return (byte_iterator, file_size). Caller must consume the iterator."""
        client = self._make_client(cfg)
        sftp = client.open_sftp()
        remote_path = self._detect_remote_path(sftp, cfg, md5)
        if remote_path is None:
            sftp.close()
            client.close()
            raise FileNotFoundError(f"File not found on SSH server for md5={md5}")

        stat = sftp.stat(remote_path)
        size = stat.st_size or 0
        f = sftp.open(remote_path, "rb")

        def _gen():
            try:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                f.close()
                sftp.close()
                client.close()

        return _gen(), size

    def read_file_bytes(self, cfg: SSHConfig, md5: str) -> bytes:
        """Download entire file into memory — used for .dir manifests."""
        client = self._make_client(cfg)
        sftp = client.open_sftp()
        try:
            remote_path = self._detect_remote_path(sftp, cfg, md5)
            if remote_path is None:
                raise FileNotFoundError(f"File not found on SSH server for md5={md5}")
            with sftp.open(remote_path, "rb") as f:
                return f.read()
        finally:
            sftp.close()
            client.close()

    def generate_urls(self, cfg: SSHConfig, md5: str, display_name: str, total_size: int | None) -> list[dict]:
        """Mirror MinIO presigned_urls_for_md5 interface — returns proxy URL dicts."""
        import json

        base_url = f"/api/storage/ssh/download?md5={md5}&name={display_name}"

        if md5.endswith(".dir"):
            raw = self.read_file_bytes(cfg, md5)
            entries = json.loads(raw)
            result = []
            for entry in entries:
                fmd5 = entry["md5"]
                relpath = entry.get("relpath", fmd5)
                result.append({
                    "name": relpath,
                    "size": entry.get("size", 0),
                    "url": f"/api/storage/ssh/download?md5={fmd5}&name={relpath}",
                })
            return result

        return [{"name": display_name, "size": total_size or 0, "url": base_url}]


    def stream_file_by_path(self, cfg: SSHConfig, path: str) -> tuple[Iterator[bytes], int]:
        """Stream a file from SSH by its full path (not md5-based)."""
        client = self._make_client(cfg)
        sftp = client.open_sftp()
        try:
            stat = sftp.stat(path)
            size = stat.st_size or 0
        except FileNotFoundError:
            sftp.close()
            client.close()
            raise FileNotFoundError(f"File not found on SSH server: {path}")

        f = sftp.open(path, "rb")

        def _gen():
            try:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                f.close()
                sftp.close()
                client.close()

        return _gen(), size

    def list_directory(self, cfg: SSHConfig, path: str) -> list[dict]:
        """List files and directories at path. Returns entries sorted: dirs first."""
        client = self._make_client(cfg)
        sftp = client.open_sftp()
        try:
            attrs = sftp.listdir_attr(path)
            entries = []
            for attr in attrs:
                if attr.filename.startswith("."):
                    continue
                is_dir = stat_module.S_ISDIR(attr.st_mode or 0)
                entry_path = path.rstrip("/") + "/" + attr.filename
                entries.append({
                    "name": attr.filename,
                    "path": entry_path,
                    "is_dir": is_dir,
                    "size": attr.st_size if not is_dir else None,
                })
            entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
            return entries
        finally:
            sftp.close()
            client.close()


    def stream_folder_zip(self, cfg: "SSHConfig", path: str) -> "Iterator[bytes]":
        import os, shutil, tempfile, zipfile
        tmpdir = tempfile.mkdtemp(prefix="ssh_folder_")
        zip_path = tmpdir + ".zip"
        try:
            client = self._make_client(cfg)
            sftp = client.open_sftp()

            def _download(remote: str, local: str):
                os.makedirs(local, exist_ok=True)
                for attr in sftp.listdir_attr(remote):
                    if attr.filename.startswith("."):
                        continue
                    r = remote.rstrip("/") + "/" + attr.filename
                    l = local + "/" + attr.filename
                    if stat_module.S_ISDIR(attr.st_mode or 0):
                        _download(r, l)
                    else:
                        sftp.get(r, l)

            _download(path, tmpdir)
            sftp.close()
            client.close()

            folder_name = path.rstrip("/").rsplit("/", 1)[-1] or "folder"
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


    def list_recursive_filtered(self, cfg: "SSHConfig", path: str, extensions: list[str]) -> list[dict]:
        """Recursively list all files under path matching given extensions (case-insensitive).
        extensions = [] means all files. Returns list of {name, path, rel_path, size}."""
        import stat as _stat
        client = self._make_client(cfg)
        sftp = client.open_sftp()
        exts = {e.lower().lstrip(".") for e in extensions if e.strip()}
        results: list[dict] = []

        def _walk(dir_path: str):
            try:
                entries = sftp.listdir_attr(dir_path)
            except Exception:
                return
            for attr in entries:
                if attr.filename.startswith("."):
                    continue
                full = dir_path.rstrip("/") + "/" + attr.filename
                if _stat.S_ISDIR(attr.st_mode or 0):
                    _walk(full)
                else:
                    ext = attr.filename.rsplit(".", 1)[-1].lower() if "." in attr.filename else ""
                    if not exts or ext in exts:
                        rel = full[len(path):].lstrip("/")
                        results.append({"name": attr.filename, "path": full, "rel_path": rel, "size": attr.st_size})

        try:
            _walk(path)
        finally:
            sftp.close()
            client.close()

        results.sort(key=lambda f: f["rel_path"].lower())
        return results

    def stream_zip_paths(self, cfg: "SSHConfig", base_path: str, rel_paths: list[str]) -> "Iterator[bytes]":
        """Stream selected files as a ZIP without buffering to disk.
        Uses a background thread + queue so the first bytes reach the client
        immediately — prevents nginx 504 on large ZIPs."""
        import io, zipfile, threading, queue as _queue

        q: "_queue.Queue" = _queue.Queue(maxsize=16)
        _DONE = object()

        class _PipeBuffer(io.RawIOBase):
            """Write-only file-like that forwards data into the queue."""
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
            client = self._make_client(cfg)
            sftp = client.open_sftp()
            try:
                buf = _PipeBuffer()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for rel in rel_paths:
                        remote_file = base_path.rstrip("/") + "/" + rel
                        info = zipfile.ZipInfo(rel.replace("\\", "/"))
                        info.compress_type = zipfile.ZIP_DEFLATED
                        with sftp.open(remote_file, "rb") as rf:
                            with zf.open(info, "w") as ze:
                                while True:
                                    chunk = rf.read(65536)
                                    if not chunk:
                                        break
                                    ze.write(chunk)
            except Exception as exc:
                q.put(exc)
                return
            finally:
                sftp.close()
                client.close()
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


ssh_service = SSHService()
