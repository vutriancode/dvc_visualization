from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from app.services.config_service import config_service
from app.services.gitlab_service import gitlab_service
from app.services.minio_service import minio_service
from app.services.ssh_service import ssh_service
from app.services.gdrive_service import gdrive_service
from app.services.redmine_service import redmine_service
from app.models.config import (
    GitLabProjectPublic, GitLabProjectCreate, GitLabProjectUpdate,
    MinIOConfigPublic, MinIOConfigUpdate,
    SSHConfigPublic, SSHConfigUpdate,
    GDriveConfigPublic, GDriveConfigUpdate,
    RedmineConfigPublic, RedmineConfigUpdate,
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


@router.get("/projects/{project_id}/repos")
async def list_group_repos(project_id: str):
    """List all sub-projects in a group (even those with no datasets)."""
    project = config_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        sub_projects = await gitlab_service.list_group_projects(project)
        return [
            {
                "path": gp["path_with_namespace"],
                "name": gp.get("name_with_namespace", gp.get("name", "")),
            }
            for gp in sub_projects
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{project_id}/branches")
async def list_project_branches(project_id: str, repo_path: str = Query(default="")):
    project = config_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        if repo_path and project.source_type == "group":
            from app.models.config import GitLabProject as GP
            target = GP(
                id=project.id, name="", gitlab_url=project.gitlab_url,
                gitlab_token=project.gitlab_token, project_path=repo_path, source_type="project",
            )
        else:
            target = project
        return await gitlab_service.list_branches(target)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{project_id}/accessible-repos")
async def list_accessible_repos(project_id: str, search: str = Query(default="")):
    """List GitLab repos accessible with this project's token (for dataset creation picker)."""
    project = config_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return await gitlab_service.list_accessible_projects(project.gitlab_url, project.gitlab_token, search)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


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


# --- SSH ---

@router.get("/ssh", response_model=SSHConfigPublic)
def get_ssh():
    return config_service.ssh_to_public(config_service.get_ssh())


@router.put("/ssh", response_model=SSHConfigPublic)
def update_ssh(payload: SSHConfigUpdate):
    try:
        cfg = config_service.update_ssh(payload)
        return config_service.ssh_to_public(cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ssh/test")
def test_ssh():
    cfg = config_service.get_ssh()
    if not cfg.host or not cfg.username:
        raise HTTPException(status_code=400, detail="SSH host and username are required")
    try:
        return ssh_service.test_connection(cfg)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Google Drive ---

@router.get("/gdrive", response_model=GDriveConfigPublic)
def get_gdrive():
    return config_service.gdrive_to_public(config_service.get_gdrive())


@router.put("/gdrive", response_model=GDriveConfigPublic)
def update_gdrive(payload: GDriveConfigUpdate):
    try:
        cfg = config_service.update_gdrive(payload)
        return config_service.gdrive_to_public(cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GDriveAuthUrlRequest(BaseModel):
    redirect_uri: str


@router.post("/gdrive/auth-url")
def gdrive_auth_url(payload: GDriveAuthUrlRequest):
    cfg = config_service.get_gdrive()
    if not cfg.client_id or not cfg.client_secret:
        raise HTTPException(status_code=400, detail="Save Client ID and Client Secret first")
    try:
        url = gdrive_service.get_auth_url(cfg.client_id, cfg.client_secret, payload.redirect_uri)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GDriveExchangeRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/gdrive/exchange-code", response_model=GDriveConfigPublic)
def gdrive_exchange_code(payload: GDriveExchangeRequest):
    cfg = config_service.get_gdrive()
    if not cfg.client_id or not cfg.client_secret:
        raise HTTPException(status_code=400, detail="Client ID and Client Secret not configured")
    try:
        refresh_token = gdrive_service.exchange_code(
            cfg.client_id, cfg.client_secret, payload.code, payload.redirect_uri
        )
        updated = config_service.set_gdrive_refresh_token(refresh_token)
        return config_service.gdrive_to_public(updated)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/gdrive/disconnect", response_model=GDriveConfigPublic)
def gdrive_disconnect():
    cfg = config_service.disconnect_gdrive()
    return config_service.gdrive_to_public(cfg)


@router.post("/gdrive/test")
def test_gdrive():
    cfg = config_service.get_gdrive()
    if not cfg.refresh_token:
        raise HTTPException(status_code=400, detail="Not connected to Google Drive")
    try:
        return gdrive_service.test_connection(cfg)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Redmine ---

@router.get("/redmine", response_model=RedmineConfigPublic)
def get_redmine():
    cfg = config_service.get_redmine()
    return config_service.redmine_to_public(cfg)


@router.get("/redmine/internal")
def get_redmine_internal(request: Request):
    """Full Redmine config including API key — for internal MCP services only.
    Returns user's personal Redmine API key if set, else the global one.
    Only accessible from within the Docker network (not exposed via nginx).
    """
    global_cfg = config_service.get_redmine()
    user = getattr(request.state, "user", None)
    api_key = global_cfg.api_key
    if user and user.credentials.redmine_api_key:
        api_key = user.credentials.redmine_api_key
    return {"url": global_cfg.url, "api_key": api_key, "verify_ssl": global_cfg.verify_ssl}


@router.put("/redmine", response_model=RedmineConfigPublic)
def update_redmine(payload: RedmineConfigUpdate):
    try:
        cfg = config_service.update_redmine(payload)
        return config_service.redmine_to_public(cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RedmineTestRequest(BaseModel):
    url: str
    api_key: str


@router.post("/redmine/test")
async def test_redmine(payload: RedmineTestRequest):
    try:
        return await redmine_service.test_connection(payload.url, payload.api_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Redmine status mapping ---

@router.get("/redmine/status-mapping")
def get_redmine_status_mapping():
    return config_service.get_redmine_status_mapping().mapping


class StatusMappingPayload(BaseModel):
    mapping: dict[str, str]  # {status_id: "todo" | "in_progress" | "done"}


@router.put("/redmine/status-mapping")
def save_redmine_status_mapping(payload: StatusMappingPayload):
    result = config_service.save_redmine_status_mapping(payload.mapping)
    return result.mapping


# --- CVAT ---

from app.models.config import CVATConfigPublic, CVATConfigUpdate
from app.services.cvat_service import cvat_service as _cvat_service


@router.get("/cvat", response_model=CVATConfigPublic)
def get_cvat():
    cfg = config_service.get_cvat()
    return config_service.cvat_to_public(cfg)


@router.put("/cvat", response_model=CVATConfigPublic)
def update_cvat(payload: CVATConfigUpdate):
    try:
        cfg = config_service.update_cvat(payload)
        return config_service.cvat_to_public(cfg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CVATTestRequest(BaseModel):
    url: str
    username: str
    password: str


@router.post("/cvat/test")
async def test_cvat(payload: CVATTestRequest):
    try:
        return await _cvat_service.test_connection(payload.url, payload.username, payload.password)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
