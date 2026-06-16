from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/storage", tags=["storage"])


def _cd(filename: str) -> str:
    """Return a Content-Disposition value safe for unicode filenames (RFC 5987)."""
    encoded = quote(filename.encode("utf-8"), safe="")
    return f"attachment; filename*=UTF-8''{encoded}"


# ── SSH folder browser ─────────────────────────────────────────────────────────

@router.get("/ssh/browse")
def ssh_browse(path: str = Query(default="/")):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    try:
        entries = ssh_service.list_directory(cfg, path)
        return {"path": path, "entries": entries}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── SSH datasets (named folders) ───────────────────────────────────────────────

@router.get("/ssh/datasets")
def list_ssh_datasets():
    from app.services.config_service import config_service
    return config_service.list_ssh_datasets()


class SSHDatasetCreate(BaseModel):
    name: str
    path: str


@router.post("/ssh/datasets", status_code=201)
def add_ssh_dataset(payload: SSHDatasetCreate):
    from app.services.config_service import config_service
    return config_service.add_ssh_dataset(payload.name, payload.path)


@router.delete("/ssh/datasets/{dataset_id}", status_code=204)
def delete_ssh_dataset(dataset_id: str):
    from app.services.config_service import config_service
    if not config_service.delete_ssh_dataset(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")


@router.get("/ssh/download-path")
def ssh_download_path(
    path: str = Query(..., description="Full path to file on SSH server"),
    name: str = Query(default="file"),
):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    try:
        gen, size = ssh_service.stream_file_by_path(cfg, path)
        headers = {
            "Content-Disposition": _cd(name),
            "Content-Length": str(size),
        }
        return StreamingResponse(gen, media_type="application/octet-stream", headers=headers)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ssh/download-folder")
def ssh_download_folder(
    path: str = Query(...),
    name: str = Query(default="folder"),
):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    try:
        gen = ssh_service.stream_folder_zip(cfg, path)
        headers = {"Content-Disposition": _cd(name + ".zip")}
        return StreamingResponse(gen, media_type="application/zip", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ssh/download")
def ssh_download(
    md5: str = Query(...),
    name: str = Query(default="file"),
):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    try:
        gen, size = ssh_service.stream_file(cfg, md5)
        headers = {
            "Content-Disposition": _cd(name),
            "Content-Length": str(size),
        }
        return StreamingResponse(gen, media_type="application/octet-stream", headers=headers)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ssh/list-filtered")
def ssh_list_filtered(
    path: str = Query(...),
    extensions: str = Query(default=""),
):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    exts = [e.strip() for e in extensions.split(",") if e.strip()] if extensions else []
    try:
        files = ssh_service.list_recursive_filtered(cfg, path, exts)
        return {"path": path, "files": files}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class ZipSelectionBody(BaseModel):
    base_path: str
    rel_paths: list[str]
    name: str = "selection"


@router.post("/ssh/download-zip-selection")
def ssh_download_zip_selection(body: ZipSelectionBody):
    from app.services.config_service import config_service
    from app.services.ssh_service import ssh_service

    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH storage is not configured")
    if not body.rel_paths:
        raise HTTPException(status_code=400, detail="No files selected")
    try:
        gen = ssh_service.stream_zip_paths(cfg, body.base_path, body.rel_paths)
        headers = {"Content-Disposition": _cd(body.name + ".zip")}
        return StreamingResponse(gen, media_type="application/zip", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/gdrive/download")
def gdrive_download(
    md5: str = Query(...),
    name: str = Query(default="file"),
):
    from app.services.config_service import config_service
    from app.services.gdrive_service import gdrive_service

    cfg = config_service.get_gdrive()
    if not cfg.refresh_token:
        raise HTTPException(status_code=400, detail="Google Drive is not connected")
    try:
        data, size = gdrive_service.stream_file(cfg, md5)
        headers = {
            "Content-Disposition": _cd(name),
            "Content-Length": str(size),
        }
        return StreamingResponse(iter([data]), media_type="application/octet-stream", headers=headers)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
