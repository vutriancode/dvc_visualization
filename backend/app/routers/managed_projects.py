"""Managed Projects — central hub linking GitLab datasets + Redmine."""
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.config_service import config_service
from app.services.redmine_service import redmine_service

router = APIRouter(prefix="/api/managed-projects", tags=["managed-projects"])


class ManagedProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    tags: Optional[list[str]] = None
    color: Optional[str] = None
    gitlab_config_id: Optional[str] = None
    ssh_dataset_ids: Optional[list[str]] = None
    rclone_dataset_ids: Optional[list[str]] = None
    redmine_project_id: Optional[str] = None
    cvat_links: Optional[list[dict]] = None


class ManagedProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    tags: Optional[list[str]] = None
    color: Optional[str] = None
    gitlab_config_id: Optional[str] = None
    ssh_dataset_ids: Optional[list[str]] = None
    rclone_dataset_ids: Optional[list[str]] = None
    redmine_project_id: Optional[str] = None
    cvat_links: Optional[list[dict]] = None


@router.get("")
def list_projects():
    return config_service.list_managed_projects()


@router.post("", status_code=201)
def create_project(payload: ManagedProjectCreate):
    return config_service.create_managed_project(payload.model_dump())


@router.put("/{project_id}")
def update_project(project_id: str, payload: ManagedProjectUpdate):
    p = config_service.update_managed_project(project_id, payload.model_dump(exclude_none=True))
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    if not config_service.delete_managed_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/{project_id}/summary")
async def get_project_summary(project_id: str):
    """Trả về thống kê tổng hợp: số dataset, tasks mở, thành viên."""
    p = config_service.get_managed_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    summary = {
        "dataset_count": 0,
        "open_task_count": 0,
        "member_count": 0,
        "total_task_count": 0,
    }

    async def count_datasets():
        total = 0
        # DVC/GitLab
        if p.gitlab_config_id:
            try:
                from app.services.gitlab_service import gitlab_service
                from app.services.config_service import config_service as cs
                gl_project = cs.get_project(p.gitlab_config_id)
                if gl_project:
                    files = await gitlab_service.list_dvc_files(gl_project)
                    total += len(files)
            except Exception:
                pass
        # SSH datasets (already stored in config, just count IDs)
        total += len(p.ssh_dataset_ids)
        # Rclone datasets
        total += len(p.rclone_dataset_ids)
        return total

    async def count_tasks():
        if not p.redmine_project_id:
            return 0, 0
        try:
            _, open_total = await redmine_service.list_issues(
                project_id=p.redmine_project_id, status_id="open", limit=1
            )
            _, all_total = await redmine_service.list_issues(
                project_id=p.redmine_project_id, status_id="*", limit=1
            )
            return open_total, all_total
        except Exception:
            return 0, 0

    async def count_members():
        if not p.redmine_project_id:
            return 0
        try:
            members = await redmine_service.list_members(p.redmine_project_id)
            return len(members)
        except Exception:
            return 0

    ds_count, (open_tasks, all_tasks), member_count = await asyncio.gather(
        count_datasets(), count_tasks(), count_members()
    )

    return {
        "dataset_count": ds_count,
        "open_task_count": open_tasks,
        "total_task_count": all_tasks,
        "member_count": member_count,
    }
