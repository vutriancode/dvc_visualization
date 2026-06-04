from fastapi import APIRouter, HTTPException
from app.services.gitlab_service import gitlab_service
from app.services.config_service import config_service
from app.models.stats import ProjectStats

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/{project_id}/stats", response_model=ProjectStats)
async def get_project_stats(project_id: str):
    project = config_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return await gitlab_service.get_project_stats(project)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
