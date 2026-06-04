from fastapi import APIRouter, HTTPException
from app.services.config_service import config_service
from app.services.gitlab_service import gitlab_service
from app.services.minio_service import minio_service
from app.models.config import (
    GitLabProjectPublic, GitLabProjectCreate, GitLabProjectUpdate,
    MinIOConfigPublic, MinIOConfigUpdate,
)

router = APIRouter(prefix="/api/config", tags=["config"])


# --- Projects ---

@router.get("/projects", response_model=list[GitLabProjectPublic])
def list_projects():
    return [config_service.project_to_public(p) for p in config_service.list_projects()]


@router.post("/projects", response_model=GitLabProjectPublic, status_code=201)
def add_project(payload: GitLabProjectCreate):
    project = config_service.add_project(payload)
    return config_service.project_to_public(project)


@router.put("/projects/{project_id}", response_model=GitLabProjectPublic)
def update_project(project_id: str, payload: GitLabProjectUpdate):
    project = config_service.update_project(project_id, payload)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return config_service.project_to_public(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str):
    if not config_service.delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/projects/{project_id}/test")
async def test_project(project_id: str):
    project = config_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return await gitlab_service.test_connection(project)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- MinIO ---

@router.get("/minio", response_model=MinIOConfigPublic)
def get_minio():
    return config_service.minio_to_public(config_service.get_minio())


@router.put("/minio", response_model=MinIOConfigPublic)
def update_minio(payload: MinIOConfigUpdate):
    try:
        cfg = config_service.update_minio(payload)
        return config_service.minio_to_public(cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/minio/test")
def test_minio():
    cfg = config_service.get_minio()
    if not cfg.endpoint or not cfg.access_key or not cfg.secret_key:
        raise HTTPException(status_code=400, detail="MinIO config is incomplete")
    try:
        return minio_service.test_connection(cfg)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
