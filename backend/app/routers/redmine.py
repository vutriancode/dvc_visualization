"""Redmine project management API endpoints."""
import asyncio
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.redmine_service import redmine_service
from app.services.config_service import config_service

router = APIRouter(prefix="/api/redmine", tags=["redmine"])


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects():
    try:
        return await redmine_service.list_projects()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    try:
        return await redmine_service.get_project(project_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/projects/{project_id}/members")
async def list_members(project_id: str):
    try:
        return await redmine_service.list_members(project_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/members/all")
async def list_all_members():
    """Lấy tất cả thành viên từ mọi dự án, loại bỏ trùng lặp."""
    try:
        projects = await redmine_service.list_projects(limit=100)
        results = await asyncio.gather(
            *[redmine_service.list_members(str(p.get("identifier") or p["id"])) for p in projects],
            return_exceptions=True,
        )
        seen: set[int] = set()
        members: list[dict] = []
        for result in results:
            if isinstance(result, list):
                for m in result:
                    if m["id"] not in seen:
                        seen.add(m["id"])
                        members.append(m)
        return sorted(members, key=lambda m: m["name"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Issues ────────────────────────────────────────────────────────────────────

@router.get("/issues")
async def list_issues(
    project_id: Optional[str] = Query(default=None),
    status_id: str = Query(default="open"),
    tracker_id: Optional[int] = Query(default=None),
    priority_id: Optional[int] = Query(default=None),
    assigned_to_id: Optional[int] = Query(default=None),
    limit: int = Query(default=100, le=100),
    offset: int = Query(default=0),
):
    try:
        issues, total = await redmine_service.list_issues(
            project_id=project_id,
            status_id=status_id,
            tracker_id=tracker_id,
            priority_id=priority_id,
            assigned_to_id=assigned_to_id,
            limit=limit,
            offset=offset,
        )
        return {"issues": issues, "total_count": total, "offset": offset, "limit": limit}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/issues/{issue_id}")
async def get_issue(issue_id: int):
    try:
        return await redmine_service.get_issue(issue_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class CreateIssuePayload(BaseModel):
    project_id: str
    subject: str
    description: str = ""
    tracker_id: Optional[int] = None
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[float] = None
    parent_issue_id: Optional[int] = None


@router.post("/issues", status_code=201)
async def create_issue(payload: CreateIssuePayload):
    try:
        return await redmine_service.create_issue(**payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class UpdateIssuePayload(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    status_id: Optional[int] = None
    priority_id: Optional[int] = None
    assigned_to_id: Optional[int] = None
    tracker_id: Optional[int] = None
    done_ratio: Optional[int] = None
    due_date: Optional[str] = None
    estimated_hours: Optional[float] = None
    notes: Optional[str] = None


@router.put("/issues/{issue_id}", status_code=204)
async def update_issue(issue_id: int, payload: UpdateIssuePayload):
    try:
        await redmine_service.update_issue(issue_id, **payload.model_dump(exclude_none=True))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/issues/{issue_id}", status_code=204)
async def delete_issue(issue_id: int):
    try:
        await redmine_service.delete_issue(issue_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Metadata (trackers, statuses, priorities) ─────────────────────────────────

@router.get("/meta")
async def get_meta():
    """Fetch trackers, statuses, priorities in one call."""
    try:
        trackers, statuses, priorities = await asyncio.gather(
            redmine_service.list_trackers(),
            redmine_service.list_statuses(),
            redmine_service.list_priorities(),
        )
        return {"trackers": trackers, "statuses": statuses, "priorities": priorities}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Working hours per member per month ───────────────────────────────────────

@router.get("/hours")
async def get_member_hours(
    project_id: Optional[str] = Query(default=None),
    member_ids: str = Query(default="", description="Comma-separated user IDs"),
    from_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
):
    """Thống kê giờ thực tế (time entries) và giờ ước tính (estimated_hours) theo tháng."""
    try:
        from datetime import date
        ids = [int(x) for x in member_ids.split(",") if x.strip().isdigit()]
        if not ids:
            return {"members": [], "months": []}

        today = date.today()
        end = date.fromisoformat(to_date) if to_date else today
        start = date.fromisoformat(from_date) if from_date else date(today.year, today.month, 1)

        # Build month list
        months: list[str] = []
        cur = date(start.year, start.month, 1)
        end_month = date(end.year, end.month, 1)
        while cur <= end_month:
            months.append(cur.strftime("%Y-%m"))
            cur = date(cur.year + (cur.month // 12), cur.month % 12 + 1, 1)

        start_str = start.isoformat()
        end_str = end.isoformat()

        # Fetch time entries (actual) per member
        async def fetch_time_entries(user_id: int) -> tuple[int, list[dict]]:
            collected: list[dict] = []
            offset = 0
            while True:
                entries, total = await redmine_service.list_time_entries(
                    project_id=project_id, user_id=user_id,
                    from_date=start_str, to_date=end_str,
                    limit=100, offset=offset,
                )
                collected.extend(entries)
                offset += len(entries)
                if offset >= total or not entries:
                    break
            return user_id, collected

        # Fetch issues (estimated) per member — all statuses, no date filter on API,
        # then filter by created_on locally
        async def fetch_issues(user_id: int) -> tuple[int, list[dict]]:
            collected: list[dict] = []
            offset = 0
            while True:
                issues, total = await redmine_service.list_issues(
                    project_id=project_id, status_id="*",
                    assigned_to_id=user_id, limit=100, offset=offset,
                )
                collected.extend(issues)
                offset += len(issues)
                if offset >= total or not issues:
                    break
            return user_id, collected

        entries_results, issues_results = await asyncio.gather(
            asyncio.gather(*[fetch_time_entries(uid) for uid in ids]),
            asyncio.gather(*[fetch_issues(uid) for uid in ids]),
        )

        # Get member names
        members_info: dict[int, str] = {}
        if project_id:
            try:
                ml = await redmine_service.list_members(project_id)
                members_info = {m["id"]: m["name"] for m in ml}
            except Exception:
                pass

        entries_by_user = dict(entries_results)
        issues_by_user = dict(issues_results)

        members_data = []
        for user_id in ids:
            entries = entries_by_user.get(user_id, [])
            issues = issues_by_user.get(user_id, [])

            # Actual hours — group by spent_on month
            actual_monthly: dict[str, float] = {m: 0.0 for m in months}
            total_actual = 0.0
            for entry in entries:
                m = entry.get("spent_on", "")[:7]
                h = float(entry.get("hours", 0))
                total_actual += h
                if m in actual_monthly:
                    actual_monthly[m] += h

            # Estimated hours — group by created_on month (within range)
            est_monthly: dict[str, float] = {m: 0.0 for m in months}
            total_estimated = 0.0
            for issue in issues:
                created = issue.get("created_on", "")[:10]
                if not created or created < start_str or created > end_str:
                    continue
                eh = float(issue.get("estimated_hours") or 0)
                total_estimated += eh
                m = created[:7]
                if m in est_monthly:
                    est_monthly[m] += eh

            members_data.append({
                "id": user_id,
                "name": members_info.get(user_id, f"User #{user_id}"),
                "total_actual": round(total_actual, 2),
                "total_estimated": round(total_estimated, 2),
                "monthly": [
                    {
                        "month": m,
                        "actual": round(actual_monthly[m], 2),
                        "estimated": round(est_monthly[m], 2),
                    }
                    for m in months
                ],
            })

        return {
            "members": members_data,
            "months": months,
            "from_date": start.isoformat(),
            "to_date": end.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Member statistics & burndown ──────────────────────────────────────────────

@router.get("/stats")
async def get_member_stats(
    project_id: Optional[str] = Query(default=None),
    member_ids: str = Query(default="", description="Comma-separated user IDs"),
    tracker_ids: str = Query(default="", description="Comma-separated tracker IDs; empty = all"),
    from_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
):
    """
    Per-member issue statistics and burndown data.
    Fetches ALL issues (open + closed) for the given members, then:
    - Aggregates counts by status
    - Builds a daily burndown series (remaining open issues per day)
    """
    try:
        ids = [int(x) for x in member_ids.split(",") if x.strip().isdigit()]
        if not ids:
            return {"members": []}

        allowed_trackers: set[int] = {
            int(x) for x in tracker_ids.split(",") if x.strip().isdigit()
        }

        today = date.today()
        end = date.fromisoformat(to_date) if to_date else today
        start = date.fromisoformat(from_date) if from_date else (end - timedelta(days=29))

        # Build day series for burndown x-axis
        days: list[str] = []
        d = start
        while d <= end:
            days.append(d.isoformat())
            d += timedelta(days=1)

        # Fetch issues per member concurrently (all statuses)
        async def fetch_member_issues(user_id: int) -> tuple[int, list[dict]]:
            collected: list[dict] = []
            offset = 0
            while True:
                issues, total = await redmine_service.list_issues(
                    project_id=project_id,
                    status_id="*",
                    assigned_to_id=user_id,
                    limit=100,
                    offset=offset,
                )
                collected.extend(issues)
                offset += len(issues)
                if offset >= total or not issues:
                    break
            return user_id, collected

        results_raw = await asyncio.gather(*[fetch_member_issues(uid) for uid in ids])

        # Filter by tracker if specified
        if allowed_trackers:
            results = [
                (uid, [i for i in issues if i.get("tracker", {}).get("id") in allowed_trackers])
                for uid, issues in results_raw
            ]
        else:
            results = list(results_raw)

        # Get member names
        members_info: dict[int, str] = {}
        if project_id:
            try:
                members_list = await redmine_service.list_members(project_id)
                members_info = {m["id"]: m["name"] for m in members_list}
            except Exception:
                pass

        # Load user-defined status mapping (ưu tiên hơn is_closed flag)
        status_mapping = config_service.get_redmine_status_mapping().mapping

        def is_done(issue: dict) -> bool:
            """True khi issue tính là done theo mapping hoặc is_closed."""
            sid = str(issue.get("status", {}).get("id", ""))
            if sid in status_mapping:
                return status_mapping[sid] == "done"
            return bool(issue.get("status", {}).get("is_closed", False))

        def done_date(issue: dict) -> str:
            """
            Ngày issue trở thành 'done' (để vẽ burndown lịch sử).
            - Nếu hiện tại KHÔNG phải done → trả "" (luôn còn lại ở mọi ngày).
            - Nếu hiện tại là done → dùng closed_on; nếu không có thì dùng updated_on.
            Đảm bảo ngày cuối cùng của burndown khớp với bảng thống kê.
            """
            if not is_done(issue):
                return ""
            cd = (issue.get("closed_on") or "")[:10]
            if cd:
                return cd
            return (issue.get("updated_on") or "")[:10]

        today_str = today.isoformat()
        members_data = []
        for user_id, issues in results:
            # Status counts + remaining (dựa trên trạng thái hiện tại)
            status_counts: dict[str, int] = {}
            remaining_count = 0
            overdue = 0
            for issue in issues:
                status = issue.get("status", {})
                sname = status.get("name", "Unknown")
                status_counts[sname] = status_counts.get(sname, 0) + 1
                if not is_done(issue):
                    remaining_count += 1
                    due = issue.get("due_date")
                    if due and due < today_str:
                        overdue += 1

            # Burndown per day: dùng done_date() để khớp với bảng thống kê
            burndown = []
            for day in days:
                total_d = 0
                remaining_d = 0
                for issue in issues:
                    created = issue.get("created_on", "")[:10]
                    if not created or created > day:
                        continue
                    total_d += 1
                    dd = done_date(issue)
                    if not dd or dd > day:
                        remaining_d += 1
                burndown.append({"date": day, "total": total_d, "remaining": remaining_d})

            members_data.append({
                "id": user_id,
                "name": members_info.get(user_id, f"User #{user_id}"),
                "total": len(issues),
                "remaining": remaining_count,   # tính từ is_closed
                "status_counts": status_counts,
                "overdue": overdue,
                "burndown": burndown,
            })

        return {
            "members": members_data,
            "from_date": start.isoformat(),
            "to_date": end.isoformat(),
            "days": days,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
