import io
import json
from app.models.config import GDriveConfig

_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

_DVC_PATH_SEGMENTS = [
    # DVC 2.x: files/md5/<aa>/<rest>
    lambda m: ["files", "md5", m[:2], m[2:]],
    # DVC 1.x: <aa>/<rest>
    lambda m: [m[:2], m[2:]],
]


class GDriveService:
    def get_auth_url(self, client_id: str, client_secret: str, redirect_uri: str) -> str:
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {"web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }},
            scopes=_SCOPES,
        )
        flow.redirect_uri = redirect_uri
        url, _ = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            include_granted_scopes="true",
        )
        return url

    def exchange_code(self, client_id: str, client_secret: str, code: str, redirect_uri: str) -> str:
        """Exchange authorization code for a refresh_token."""
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {"web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }},
            scopes=_SCOPES,
        )
        flow.redirect_uri = redirect_uri
        flow.fetch_token(code=code)
        return flow.credentials.refresh_token

    def _build_service(self, cfg: GDriveConfig):
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        creds = Credentials(
            token=None,
            refresh_token=cfg.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=cfg.client_id,
            client_secret=cfg.client_secret,
            scopes=_SCOPES,
        )
        return build("drive", "v3", credentials=creds, cache_discovery=False)

    def test_connection(self, cfg: GDriveConfig) -> dict:
        try:
            service = self._build_service(cfg)
            result = service.about().get(fields="user").execute()
            email = result.get("user", {}).get("emailAddress", "")
            folder = service.files().get(fileId=cfg.folder_id, fields="name").execute()
            return {"ok": True, "email": email, "folder": folder.get("name", "")}
        except Exception as e:
            raise RuntimeError(str(e))

    def _find_in_folder(self, service, parent_id: str, name: str) -> str | None:
        """Return the Drive file/folder ID matching name inside parent_id."""
        resp = service.files().list(
            q=f"'{parent_id}' in parents and name = '{name}' and trashed = false",
            fields="files(id,name)",
            pageSize=1,
        ).execute()
        files = resp.get("files", [])
        return files[0]["id"] if files else None

    def _find_file_id(self, service, folder_id: str, md5: str) -> str | None:
        for segments_fn in _DVC_PATH_SEGMENTS:
            segments = segments_fn(md5)
            current_id = folder_id
            for segment in segments:
                current_id = self._find_in_folder(service, current_id, segment)
                if current_id is None:
                    break
            if current_id is not None:
                return current_id
        return None

    def download_file_bytes(self, cfg: GDriveConfig, md5: str) -> bytes:
        from googleapiclient.http import MediaIoBaseDownload
        service = self._build_service(cfg)
        file_id = self._find_file_id(service, cfg.folder_id, md5)
        if file_id is None:
            raise FileNotFoundError(f"File not found in Google Drive for md5={md5}")
        request = service.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buf.getvalue()

    def stream_file(self, cfg: GDriveConfig, md5: str) -> tuple[bytes, int]:
        """Download file fully (GDrive doesn't support true streaming easily)."""
        data = self.download_file_bytes(cfg, md5)
        return data, len(data)

    def generate_urls(self, cfg: GDriveConfig, md5: str, display_name: str, total_size: int | None) -> list[dict]:
        """Mirror MinIO interface — returns proxy URL dicts."""
        base_url = f"/api/storage/gdrive/download?md5={md5}&name={display_name}"

        if md5.endswith(".dir"):
            raw = self.download_file_bytes(cfg, md5)
            entries = json.loads(raw)
            result = []
            for entry in entries:
                fmd5 = entry["md5"]
                relpath = entry.get("relpath", fmd5)
                result.append({
                    "name": relpath,
                    "size": entry.get("size", 0),
                    "url": f"/api/storage/gdrive/download?md5={fmd5}&name={relpath}",
                })
            return result

        return [{"name": display_name, "size": total_size or 0, "url": base_url}]


gdrive_service = GDriveService()
