import uuid
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.rclone_service import rclone_service, PROVIDERS
from app.services.config_service import config_service

router = APIRouter(prefix="/api/rclone", tags=["rclone"])


def _cd(filename: str) -> str:
    """Return a Content-Disposition value safe for unicode filenames (RFC 5987)."""
    encoded = quote(filename.encode("utf-8"), safe="")
    return f"attachment; filename*=UTF-8''{encoded}"


# ── Providers list ─────────────────────────────────────────────────────────────

@router.get("/providers")
def list_providers():
    return [
        {"type": k, "label": v["label"], "oauth": v["oauth"]}
        for k, v in PROVIDERS.items()
    ]


# ── Auth flow ──────────────────────────────────────────────────────────────────

class AuthStartRequest(BaseModel):
    provider: str   # e.g. "drive", "dropbox"


@router.post("/auth/start")
def auth_start(payload: AuthStartRequest):
    if payload.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {payload.provider}")
    session_id = str(uuid.uuid4())
    try:
        url = rclone_service.start_auth(session_id, payload.provider)
        return {"session_id": session_id, "url": url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/auth/poll")
def auth_poll(session_id: str = Query(...)):
    return rclone_service.poll_auth(session_id)


class AuthFinishRequest(BaseModel):
    session_id: str
    remote_name: str  # user-chosen name for this remote
    provider: str


@router.post("/auth/finish")
def auth_finish(payload: AuthFinishRequest):
    ok = rclone_service.finish_auth(payload.session_id, payload.remote_name, payload.provider)
    if not ok:
        raise HTTPException(status_code=400, detail="OAuth did not complete. Try authorizing again.")
    return {"ok": True, "remote": payload.remote_name}


# ── Remotes CRUD ───────────────────────────────────────────────────────────────

@router.get("/remotes")
def list_remotes():
    return rclone_service.list_remotes()


@router.delete("/remotes/{name}", status_code=204)
def delete_remote(name: str):
    if not rclone_service.delete_remote(name):
        raise HTTPException(status_code=404, detail="Remote not found")
    # Also remove any datasets using this remote
    for ds in config_service.list_rclone_datasets():
        if ds.remote == name:
            config_service.delete_rclone_dataset(ds.id)


@router.post("/remotes/{name}/test")
def test_remote(name: str):
    try:
        return rclone_service.test_remote(name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Browse ─────────────────────────────────────────────────────────────────────

@router.get("/browse")
def browse(
    remote: str = Query(...),
    path: str = Query(default=""),
):
    try:
        entries = rclone_service.list_directory(remote, path)
        return {"remote": remote, "path": path, "entries": entries}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Download ───────────────────────────────────────────────────────────────────

@router.get("/download")
def download(
    remote: str = Query(...),
    path: str = Query(...),
    name: str = Query(default="file"),
):
    try:
        gen = rclone_service.stream_file(remote, path)
        headers = {"Content-Disposition": _cd(name)}
        return StreamingResponse(gen, media_type="application/octet-stream", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/download-folder")
def download_folder(
    remote: str = Query(...),
    path: str = Query(...),
    name: str = Query(default="folder"),
):
    try:
        gen = rclone_service.stream_folder_zip(remote, path)
        headers = {"Content-Disposition": _cd(name + ".zip")}
        return StreamingResponse(gen, media_type="application/zip", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Rclone Datasets ────────────────────────────────────────────────────────────

@router.get("/datasets")
def list_datasets():
    return config_service.list_rclone_datasets()


class RcloneDatasetCreate(BaseModel):
    name: str
    remote: str
    path: str
    provider: str


@router.post("/datasets", status_code=201)
def add_dataset(payload: RcloneDatasetCreate):
    return config_service.add_rclone_dataset(
        payload.name, payload.remote, payload.path, payload.provider
    )


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str):
    if not config_service.delete_rclone_dataset(dataset_id):
        raise HTTPException(status_code=404, detail="Dataset not found")


@router.get("/list-filtered")
def rclone_list_filtered(
    remote: str = Query(...),
    path: str = Query(default=""),
    extensions: str = Query(default=""),
):
    exts = [e.strip() for e in extensions.split(",") if e.strip()] if extensions else []
    try:
        files = rclone_service.list_recursive_filtered(remote, path, exts)
        return {"remote": remote, "path": path, "files": files}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class RcloneZipSelectionBody(BaseModel):
    remote: str
    base_path: str
    rel_paths: list[str]
    name: str = "selection"


@router.post("/download-zip-selection")
def rclone_download_zip_selection(body: RcloneZipSelectionBody):
    if not body.rel_paths:
        raise HTTPException(status_code=400, detail="No files selected")
    try:
        gen = rclone_service.stream_zip_paths(body.remote, body.base_path, body.rel_paths)
        headers = {"Content-Disposition": _cd(body.name + ".zip")}
        return StreamingResponse(gen, media_type="application/zip", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
