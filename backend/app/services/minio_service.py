from minio import Minio
from minio.error import S3Error
from app.models.dataset import MinioObject
from app.models.config import MinIOConfig


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
