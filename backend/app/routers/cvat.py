"""CVAT annotation platform API endpoints."""
import asyncio
import hashlib
import io
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel as PydanticBaseModel

from app.services.cvat_service import cvat_service

router = APIRouter(prefix="/api/cvat", tags=["cvat"])


def _job_frames(job: dict) -> int:
    return max(0, job.get("stop_frame", 0) - job.get("start_frame", 0) + 1)


def _job_state(job: dict) -> str:
    # CVAT v2: state field; v1: status field
    return job.get("state") or job.get("status") or "unknown"


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _period_key(dt: datetime, group_by: str) -> str:
    if group_by == "week":
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if group_by == "month":
        return dt.strftime("%Y-%m")
    return dt.strftime("%Y-%m-%d")


@router.get("/projects")
async def list_projects():
    try:
        return await cvat_service.list_projects()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/tasks")
async def list_tasks(project_id: Optional[int] = Query(default=None)):
    try:
        return await cvat_service.list_tasks(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats")
async def get_stats(
    project_id: int = Query(...),
    from_date: str = Query(...),   # YYYY-MM-DD
    to_date: str = Query(...),     # YYYY-MM-DD
    group_by: str = Query(default="day"),  # day | week | month
):
    """
    Thống kê tiến độ và tốc độ annotation theo dự án CVAT.
    Trả về:
    - Tổng quan dự án (total jobs, frames, progress %)
    - Per-user: jobs completed, frames, speed
    - Timeline: frames completed theo ngày/tuần/tháng per user
    """
    try:
        jobs = await cvat_service.list_jobs(project_id=project_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    try:
        from_dt = datetime.strptime(from_date, "%Y-%m-%d")
        to_dt = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    # ── Overall progress ──────────────────────────────────────────────────────
    total_jobs = len(jobs)
    total_frames = sum(_job_frames(j) for j in jobs)
    state_counts: dict[str, int] = {}
    completed_frames_all = 0

    for job in jobs:
        st = _job_state(job)
        state_counts[st] = state_counts.get(st, 0) + 1
        if st == "completed":
            completed_frames_all += _job_frames(job)

    completed_jobs_all = state_counts.get("completed", 0)
    progress_pct = round(completed_jobs_all / total_jobs * 100, 1) if total_jobs else 0

    # ── In-period stats ───────────────────────────────────────────────────────
    user_stats: dict[int, dict] = {}
    # timeline: { period_key: { user_id: frames } }
    timeline: dict[str, dict[int, int]] = {}

    for job in jobs:
        st = _job_state(job)
        if st != "completed":
            continue

        updated_dt = _parse_dt(job.get("updated_date"))
        if updated_dt is None or not (from_dt <= updated_dt <= to_dt):
            continue

        assignee = job.get("assignee")
        if not assignee:
            continue

        uid = assignee.get("id") or 0
        uname = assignee.get("username") or f"user_{uid}"
        display = f"{assignee.get('first_name', '')} {assignee.get('last_name', '')}".strip() or uname

        frames = _job_frames(job)
        if uid not in user_stats:
            user_stats[uid] = {
                "id": uid,
                "username": uname,
                "display_name": display,
                "jobs_completed": 0,
                "frames_completed": 0,
            }
        user_stats[uid]["jobs_completed"] += 1
        user_stats[uid]["frames_completed"] += frames

        # Timeline
        key = _period_key(updated_dt, group_by)
        if key not in timeline:
            timeline[key] = {}
        timeline[key][uid] = timeline[key].get(uid, 0) + frames

    # Calculate speed (frames per day) for each user
    days_in_period = max(1, (to_dt - from_dt).days + 1)
    for u in user_stats.values():
        u["frames_per_day"] = round(u["frames_completed"] / days_in_period, 1)

    # Convert timeline to sorted list
    sorted_periods = sorted(timeline.keys())
    timeline_list = [
        {
            "period": p,
            "users": {str(uid): frames for uid, frames in users.items()},
        }
        for p, users in sorted(timeline.items())
    ]

    # Build all user IDs that appear in period
    all_user_ids_in_period = list(user_stats.keys())

    return {
        "project_id": project_id,
        "from_date": from_date,
        "to_date": to_date,
        "group_by": group_by,
        # Overall
        "total_jobs": total_jobs,
        "total_frames": total_frames,
        "completed_jobs": completed_jobs_all,
        "completed_frames": completed_frames_all,
        "progress_pct": progress_pct,
        "state_counts": state_counts,
        # In-period
        "users": list(user_stats.values()),
        "timeline": timeline_list,
        "user_ids_in_period": all_user_ids_in_period,
    }


class SyncToDVCPayload(PydanticBaseModel):
    cvat_project_id: int
    gitlab_config_id: str
    dvc_path: str = "annotations"
    export_format: str = "CVAT for images 1.1"


@router.post("/sync-to-dvc", status_code=202)
async def sync_to_dvc(payload: SyncToDVCPayload):
    """Start a background CVAT → DVC sync job. Returns job_id immediately."""
    from app.services.sync_service import create_job, run_sync
    from app.services.config_service import config_service as cs

    if not cs.get_project(payload.gitlab_config_id):
        raise HTTPException(status_code=404, detail="GitLab config not found")

    job_id = create_job({
        "cvat_project_id": payload.cvat_project_id,
        "gitlab_config_id": payload.gitlab_config_id,
        "dvc_path": payload.dvc_path,
        "export_format": payload.export_format,
    })
    asyncio.create_task(run_sync(job_id))
    return {"job_id": job_id, "status": "pending"}


@router.get("/sync-jobs/{job_id}")
def get_sync_job(job_id: str):
    from app.services.sync_service import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/sync-jobs")
def list_sync_jobs(cvat_project_id: int = Query(...)):
    from app.services.sync_service import list_jobs_for
    return list_jobs_for(cvat_project_id)


@router.post("/sync-jobs/{job_id}/retry", status_code=202)
def retry_sync_job(job_id: str):
    from app.services.sync_service import get_job, retry_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "error":
        raise HTTPException(status_code=409, detail="Job is not in error state")
    retry_job(job_id)
    return {"job_id": job_id, "status": "running"}


