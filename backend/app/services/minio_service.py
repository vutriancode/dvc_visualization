from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error
from app.models.dataset import MinioObject
from app.models.config import MinIOConfig


# DVC path patterns to probe, in priority order.
# DVC 2+ stores files under files/md5/<aa>/<bbb...>
# DVC 1.x stores files directly under <aa>/<bbb...>
_DVC_PATH_PATTERNS = [
    lambda prefix, m: f"{prefix}files/md5/{m[:2]}/{m[2:]}",
    lambda prefix, m: f"{prefix}{m[:2]}/{m[2:]}",
]


def _clean_endpoint(endpoint: str) -> tuple[str, bool | None]:
    """Normalise a MinIO endpoint to the plain host[:port] form the SDK expects.

    Returns (clean_endpoint, use_ssl_override).
    use_ssl_override is set when the scheme is unambiguous (http → False, https → True),
    or None when no scheme was present (caller keeps the stored use_ssl flag).
    """
    stripped = endpoint.strip()
    if "://" in stripped:
        parsed = urlparse(stripped)
        host = parsed.netloc.rstrip("/") or parsed.path.rstrip("/")
        ssl = parsed.scheme.lower() == "https"
        return host, ssl
    # No scheme — strip any accidental trailing path/slash
    host = stripped.rstrip("/").split("/")[0]
    return host, None


class MinioService:
    def _client(self) -> tuple[Minio, str]:
        from app.services.config_service import config_service
        cfg = config_service.get_minio()
        endpoint, ssl_override = _clean_endpoint(cfg.endpoint)
        use_ssl = ssl_override if ssl_override is not None else cfg.use_ssl
        client = Minio(
            endpoint,
            access_key=cfg.access_key,
            secret_key=cfg.secret_key,
            secure=use_ssl,
        )
        return client, cfg.bucket

    def list_objects(self, prefix: str = "") -> list[MinioObject]:
        try:
            client, bucket = self._client()
            if not client.bucket_exists(bucket):
                raise ValueError(f"Bucket '{bucket}' does not exist")
            objects = client.list_objects(bucket, prefix=prefix, recursive=True)
            return [
                MinioObject(
                    name=obj.object_name,
                    size=obj.size or 0,
                    last_modified=obj.last_modified.isoformat() if obj.last_modified else "",
                    etag=obj.etag,
                )
                for obj in objects
            ]
        except S3Error as e:
            raise RuntimeError(f"MinIO error: {e}")

    def get_presigned_url(self, object_name: str, expires_seconds: int = 3600) -> str:
        from datetime import timedelta
        try:
            client, bucket = self._client()
            return client.presigned_get_object(
                bucket, object_name, expires=timedelta(seconds=expires_seconds)
            )
        except S3Error as e:
            raise RuntimeError(f"MinIO error: {e}")

    def get_object_bytes(self, object_name: str) -> bytes:
        client, bucket = self._client()
        return self._get_object_bytes_with_client(client, bucket, object_name)

    # ------------------------------------------------------------------
    # DVC remote config helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_dvc_remote(dvc_remote: dict) -> tuple[str, str, str, bool]:
        """Parse DVC remote config → (endpoint_host, bucket, path_prefix, use_ssl).

        path_prefix is the sub-path inside the bucket from the remote URL,
        e.g. s3://bucket/some/path → path_prefix = "some/path".
        """
        from urllib.parse import urlparse
        url = dvc_remote.get("url", "")
        without_scheme = (
            url.replace("s3://", "").replace("gs://", "").replace("azure://", "")
        )
        parts = without_scheme.split("/", 1)
        bucket = parts[0]
        path_prefix = parts[1].strip("/") if len(parts) > 1 else ""

        endpoint_raw = dvc_remote.get("endpointurl", "")
        parsed = urlparse(endpoint_raw)
        endpoint_host = parsed.netloc or parsed.path
        use_ssl = parsed.scheme == "https"
        return endpoint_host, bucket, path_prefix, use_ssl

    def _client_from_dvc_remote(self, dvc_remote: dict) -> tuple[Minio, str, str]:
        """Returns (minio_client, bucket, path_prefix)."""
        endpoint_host, bucket, path_prefix, use_ssl = self._parse_dvc_remote(dvc_remote)
        access_key = dvc_remote.get("access_key_id", "")
        secret_key = dvc_remote.get("secret_access_key", "")
        client = Minio(endpoint_host, access_key=access_key, secret_key=secret_key, secure=use_ssl)
        return client, bucket, path_prefix

    # ------------------------------------------------------------------
    # Core: detect DVC path pattern and generate presigned URLs
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_path(client: Minio, bucket: str, md5: str, path_prefix: str) -> str | None:
        """Try each DVC path pattern and return the first one that exists."""
        prefix = f"{path_prefix}/" if path_prefix else ""
        for pattern in _DVC_PATH_PATTERNS:
            candidate = pattern(prefix, md5)
            try:
                client.stat_object(bucket, candidate)
                return candidate
            except S3Error:
                continue
        return None

    @staticmethod
    def _make_path(md5: str, path_prefix: str, use_new_format: bool) -> str:
        prefix = f"{path_prefix}/" if path_prefix else ""
        if use_new_format:
            return f"{prefix}files/md5/{md5[:2]}/{md5[2:]}"
        return f"{prefix}{md5[:2]}/{md5[2:]}"

    def _generate_presigned_urls(
        self,
        client: Minio,
        bucket: str,
        md5: str,
        display_name: str,
        total_size: int | None,
        path_prefix: str = "",
    ) -> list[dict]:
        import json
        from datetime import timedelta

        def _url(obj_name: str) -> str:
            return client.presigned_get_object(bucket, obj_name, expires=timedelta(hours=1))

        if md5.endswith(".dir"):
            manifest_path = self._detect_path(client, bucket, md5, path_prefix)
            if manifest_path is None:
                raise RuntimeError(
                    f"Directory manifest not found in bucket '{bucket}' for md5={md5}. "
                    "Tried both DVC 2.x (files/md5/…) and DVC 1.x (…) path patterns."
                )
            use_new_format = "files/md5" in manifest_path
            raw = self._get_object_bytes_with_client(client, bucket, manifest_path)
            entries = json.loads(raw)
            result = []
            for entry in entries:
                fmd5 = entry["md5"]
                relpath = entry.get("relpath", fmd5)
                obj_name = self._make_path(fmd5, path_prefix, use_new_format)
                try:
                    result.append({"name": relpath, "size": entry.get("size", 0), "url": _url(obj_name)})
                except Exception:
                    result.append({"name": relpath, "size": entry.get("size", 0), "url": None})
            return result
        else:
            obj_path = self._detect_path(client, bucket, md5, path_prefix)
            if obj_path is None:
                raise RuntimeError(
                    f"File not found in bucket '{bucket}' for md5={md5}. "
                    "Tried both DVC 2.x (files/md5/…) and DVC 1.x (…) path patterns."
                )
            return [{"name": display_name, "size": total_size or 0, "url": _url(obj_path)}]

    def _get_object_bytes_with_client(self, client: Minio, bucket: str, object_name: str) -> bytes:
        response = client.get_object(bucket, object_name)
        try:
            return response.read()
        finally:
            try:
                response.close()
                response.release_conn()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def presigned_urls_for_md5(self, md5: str, display_name: str, total_size: int | None) -> list[dict]:
        """Use app MinIO settings to generate presigned URLs."""
        client, bucket = self._client()
        return self._generate_presigned_urls(client, bucket, md5, display_name, total_size, path_prefix="")

    def presigned_urls_from_dvc_remote(
        self, dvc_remote: dict, md5: str, display_name: str, total_size: int | None
    ) -> list[dict]:
        """Use .dvc/config remote config to generate presigned URLs."""
        client, bucket, path_prefix = self._client_from_dvc_remote(dvc_remote)
        return self._generate_presigned_urls(client, bucket, md5, display_name, total_size, path_prefix)

    def get_dvc_object(self, md5: str) -> bytes | None:
        """Fetch a DVC object from MinIO. Returns None if not found."""
        from minio.error import S3Error
        client, bucket = self._client()
        try:
            response = client.get_object(bucket, f"files/md5/{md5[:2]}/{md5[2:]}")
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            if e.code in ("NoSuchKey", "NoSuchObject"):
                return None
            raise

    def dvc_object_exists(self, md5: str) -> bool:
        """Return True if the DVC object for this md5 already exists in MinIO."""
        from minio.error import S3Error
        client, bucket = self._client()
        try:
            client.stat_object(bucket, f"files/md5/{md5[:2]}/{md5[2:]}")
            return True
        except S3Error as e:
            if e.code in ("NoSuchKey", "NoSuchObject"):
                return False
            raise

    def upload_dvc_object(self, md5: str, data: bytes) -> str:
        """Upload raw bytes to MinIO at both DVC cache paths.

        DVC on Linux uses files/md5/…; DVC on Windows uses files/md5-dos2unix/…
        We write both so clients on any platform can pull successfully.
        Returns the primary object name.
        """
        import io as _io
        client, bucket = self._client()
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        for prefix in ("files/md5", "files/md5-dos2unix"):
            object_name = f"{prefix}/{md5[:2]}/{md5[2:]}"
            client.put_object(bucket, object_name, _io.BytesIO(data), length=len(data))
        return f"files/md5/{md5[:2]}/{md5[2:]}"

    def upload_dvc_stream(self, md5: str, stream, size: int) -> str:
        """Upload a stream to MinIO using multipart, then mirror to md5-dos2unix path.
        Uses multipart upload when size > 64 MiB so memory stays flat.
        Returns the primary object name."""
        from minio.commonconfig import CopySource
        client, bucket = self._client()
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        primary = f"files/md5/{md5[:2]}/{md5[2:]}"
        part_size = 64 * 1024 * 1024
        client.put_object(bucket, primary, stream, length=size, part_size=part_size)
        # Mirror to md5-dos2unix path for Windows DVC compatibility
        dos2unix = f"files/md5-dos2unix/{md5[:2]}/{md5[2:]}"
        client.copy_object(bucket, dos2unix, CopySource(bucket, primary))
        return primary

    def test_connection(self, cfg: MinIOConfig) -> dict:
        try:
            endpoint, ssl_override = _clean_endpoint(cfg.endpoint)
            use_ssl = ssl_override if ssl_override is not None else cfg.use_ssl
            client = Minio(
                endpoint,
                access_key=cfg.access_key,
                secret_key=cfg.secret_key,
                secure=use_ssl,
            )
            exists = client.bucket_exists(cfg.bucket)
            return {"ok": True, "bucket": cfg.bucket, "bucket_exists": exists}
        except Exception as e:
            raise RuntimeError(str(e))


minio_service = MinioService()
