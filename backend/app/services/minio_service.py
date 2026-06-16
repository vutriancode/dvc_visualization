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


class MinioService:
    def _client(self) -> tuple[Minio, str]:
        from app.services.config_service import config_service
        cfg = config_service.get_minio()
        client = Minio(
            cfg.endpoint,
            access_key=cfg.access_key,
            secret_key=cfg.secret_key,
            secure=cfg.use_ssl,
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

    def test_connection(self, cfg: MinIOConfig) -> dict:
        try:
            client = Minio(
                cfg.endpoint,
                access_key=cfg.access_key,
                secret_key=cfg.secret_key,
                secure=cfg.use_ssl,
            )
            exists = client.bucket_exists(cfg.bucket)
            return {"ok": True, "bucket": cfg.bucket, "bucket_exists": exists}
        except Exception as e:
            raise RuntimeError(str(e))


minio_service = MinioService()
