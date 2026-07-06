"""Redmine project management API endpoints."""
import asyncio
import io
from datetime import date, datetime, timedelta
from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
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


class LogTimePayload(BaseModel):
    hours: float
    spent_on: str
    activity_id: Optional[int] = None
    comments: str = ""


@router.post("/issues/{issue_id}/time-entries", status_code=201)
async def log_time(issue_id: int, payload: LogTimePayload):
    try:
        return await redmine_service.create_time_entry(
            issue_id=issue_id,
            hours=payload.hours,
            spent_on=payload.spent_on,
            activity_id=payload.activity_id,
            comments=payload.comments,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/time-activities")
async def list_time_activities():
    try:
        return await redmine_service.list_time_activities()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/logged-issue-ids")
async def get_logged_issue_ids(
    project_id: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    member_ids: Optional[str] = Query(default=None),
):
    try:
        user_ids = [int(x) for x in member_ids.split(",") if x] if member_ids else None
        ids = await redmine_service.list_logged_issue_ids(
            project_id=project_id,
            from_date=from_date,
            to_date=to_date,
            user_ids=user_ids,
        )
        return ids
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


# ── Export Time Entries to Excel ──────────────────────────────────────────────

@router.get("/hotfix")
async def get_hotfix_issues(
    query_url: str = Query(..., description="Full Redmine query URL, e.g. https://redmine.example.com/projects/my-project/issues?query_id=123"),
    qa_status: str = Query(default="QA Verified", description="Comma-separated status names counted as QA verified"),
):
    """
    Lấy tất cả issues từ sprint query URL, trả về toàn bộ danh sách
    và danh sách các issue đã được QA Verified trong ngày hôm nay.
    """
    try:
        from urllib.parse import urlparse, parse_qs

        parsed = urlparse(query_url)
        path_parts = [p for p in parsed.path.split("/") if p]
        project_id: str | None = None
        if "projects" in path_parts:
            idx = path_parts.index("projects")
            if idx + 1 < len(path_parts):
                project_id = path_parts[idx + 1]

        qs = parse_qs(parsed.query)
        query_id: int | None = int(qs["query_id"][0]) if "query_id" in qs else None

        if not project_id and not query_id:
            raise HTTPException(status_code=400, detail="URL không hợp lệ — cần chứa project identifier và/hoặc query_id")

        all_issues: list[dict] = []
        offset = 0
        while True:
            issues, total = await redmine_service.list_issues(
                project_id=project_id,
                query_id=query_id,
                status_id="*",
                limit=100,
                offset=offset,
            )
            all_issues.extend(issues)
            offset += len(issues)
            if offset >= total or not issues:
                break

        today_str = date.today().isoformat()
        qa_status_names = {s.strip() for s in qa_status.split(",") if s.strip()}

        qa_today = [
            i for i in all_issues
            if i.get("status", {}).get("name", "") in qa_status_names
            and (i.get("updated_on") or "")[:10] == today_str
        ]

        # Count by status
        status_counts: dict[str, int] = {}
        for issue in all_issues:
            sname = issue.get("status", {}).get("name", "Unknown")
            status_counts[sname] = status_counts.get(sname, 0) + 1

        return {
            "all_issues": all_issues,
            "qa_verified_today": qa_today,
            "status_counts": status_counts,
            "today": today_str,
            "project_id": project_id,
            "query_id": query_id,
            "total": len(all_issues),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


class CreateDeployTaskPayload(BaseModel):
    project_id: str
    issue_ids: list[int]
    tracker_id: Optional[int] = None
    subject: Optional[str] = None


@router.post("/hotfix/deploy-task", status_code=201)
async def create_deploy_task(payload: CreateDeployTaskPayload):
    """
    Tạo task deploy stg tổng hợp các issue đã QA Verified, theo format:
    subject "deploy stg task ngày DD-MM-YYYY", description liệt kê "task #id #id ...",
    và tạo quan hệ "relates" tới từng issue.
    """
    if not payload.issue_ids:
        raise HTTPException(status_code=400, detail="Cần ít nhất một issue để tạo task deploy")
    try:
        tracker_id = payload.tracker_id
        if tracker_id is None:
            trackers = await redmine_service.list_trackers()
            task_tracker = next((t for t in trackers if t.get("name", "").strip().lower() == "task"), None)
            tracker_id = task_tracker["id"] if task_tracker else (trackers[0]["id"] if trackers else None)

        subject = payload.subject or f"deploy stg task ngày {date.today().strftime('%d-%m-%Y')}"
        description = "task " + " ".join(f"#{iid}" for iid in payload.issue_ids)

        # Nhiều project Redmine bắt buộc category/fixed_version/custom fields khi tạo issue.
        # Lấy các giá trị này từ các issue QA Verified liên quan để đảm bảo hợp lệ với project
        # (issue đầu tiên có thể thiếu category/fixed_version nên cần dò qua tất cả).
        category_id = None
        fixed_version_id = None
        custom_fields_map: dict[int, dict] = {}
        try:
            templates = await asyncio.gather(
                *[redmine_service.get_issue(iid) for iid in payload.issue_ids],
                return_exceptions=True,
            )
            for t in templates:
                if isinstance(t, Exception):
                    continue
                if category_id is None and t.get("category"):
                    category_id = t["category"]["id"]
                if fixed_version_id is None and t.get("fixed_version"):
                    fixed_version_id = t["fixed_version"]["id"]
                for cf in t.get("custom_fields", []):
                    if cf.get("value") and cf["id"] not in custom_fields_map:
                        custom_fields_map[cf["id"]] = {"id": cf["id"], "value": cf["value"]}
        except Exception:
            pass

        if category_id is None:
            try:
                project = await redmine_service.get_project(payload.project_id)
                cats = project.get("issue_categories", [])
                default_cat = next((c for c in cats if c.get("name", "").strip().lower() == "chung"), None)
                category_id = default_cat["id"] if default_cat else (cats[0]["id"] if cats else None)
            except Exception:
                pass

        custom_fields = list(custom_fields_map.values()) or None

        created = await redmine_service.create_issue(
            project_id=payload.project_id,
            subject=subject,
            description=description,
            tracker_id=tracker_id,
            category_id=category_id,
            fixed_version_id=fixed_version_id,
            custom_fields=custom_fields,
        )

        results = await asyncio.gather(
            *[redmine_service.create_relation(created["id"], iid, "relates") for iid in payload.issue_ids],
            return_exceptions=True,
        )
        relations_failed = [
            iid for iid, r in zip(payload.issue_ids, results) if isinstance(r, Exception)
        ]

        return {"issue": created, "relations_failed": relations_failed}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Export Time Entries to Excel ──────────────────────────────────────────────

@router.get("/export/time-entries")
async def export_time_entries(
    project_ids: str = Query(default="", description="Comma-separated project identifiers; empty = all"),
    user_ids: str = Query(default="", description="Comma-separated user IDs"),
    from_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
):
    """Xuất báo cáo log time theo thành viên ra file Excel."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        pids: list[Optional[str]] = [x.strip() for x in project_ids.split(",") if x.strip()] or [None]
        ids = [int(x) for x in user_ids.split(",") if x.strip().isdigit()]
        if not ids:
            raise HTTPException(status_code=400, detail="Cần chọn ít nhất một thành viên")

        today = date.today()
        end = date.fromisoformat(to_date) if to_date else today
        start = date.fromisoformat(from_date) if from_date else date(today.year, today.month, 1)

        # Get member names from all selected projects
        members_info: dict[int, str] = {}
        for pid in pids:
            if pid:
                try:
                    ml = await redmine_service.list_members(pid)
                    for m in ml:
                        members_info.setdefault(m["id"], m["name"])
                except Exception:
                    pass

        async def fetch_user_entries(user_id: int) -> tuple[int, list[dict]]:
            """Fetch time entries cho user across tất cả projects đã chọn, dedup theo entry id."""
            seen: set[int] = set()
            collected: list[dict] = []
            for pid in pids:
                offset = 0
                while True:
                    entries, total = await redmine_service.list_time_entries(
                        project_id=pid,
                        user_id=user_id,
                        from_date=start.isoformat(),
                        to_date=end.isoformat(),
                        limit=100,
                        offset=offset,
                    )
                    for e in entries:
                        eid = e.get("id", 0)
                        if eid not in seen:
                            seen.add(eid)
                            collected.append(e)
                    offset += len(entries)
                    if offset >= total or not entries:
                        break
            return user_id, collected

        all_results = await asyncio.gather(*[fetch_user_entries(uid) for uid in ids])

        # Fetch issue subjects for all entries (to populate "Nội dung công việc")
        all_issue_ids: set[int] = set()
        for _, entries in all_results:
            for e in entries:
                iid = e.get("issue", {}).get("id")
                if iid:
                    all_issue_ids.add(iid)

        async def fetch_issue_safe(iid: int) -> tuple[int, str]:
            try:
                issue = await redmine_service.get_issue(iid)
                return iid, issue.get("subject", "")
            except Exception:
                return iid, ""

        issue_subjects: dict[int, str] = dict(
            await asyncio.gather(*[fetch_issue_safe(iid) for iid in all_issue_ids])
        )

        results = all_results

        # Build Excel
        wb = Workbook()
        wb.remove(wb.active)

        header_fill = PatternFill(start_color="CFE2F3", end_color="CFE2F3", fill_type="solid")
        header_font = Font(bold=True, name="Calibri", size=11)
        thin = Side(border_style="thin", color="000000")
        cell_border = Border(left=thin, right=thin, top=thin, bottom=thin)
        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left_align = Alignment(horizontal="left", vertical="top", wrap_text=True)

        HEADERS = ["Ngày", "Họ và Tên", "Tên dự án", "Nội dung công việc", "Số giờ ", "Người Duyệt", "Ghi chú"]
        COL_WIDTHS = [15, 22, 25, 65, 10, 20, 25]

        for user_id, entries in results:
            member_name = members_info.get(user_id, f"User_{user_id}")
            ws = wb.create_sheet(title=member_name[:31])

            for col_idx, (header, width) in enumerate(zip(HEADERS, COL_WIDTHS), start=1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = center_align
                cell.border = cell_border
                ws.column_dimensions[get_column_letter(col_idx)].width = width
            ws.row_dimensions[1].height = 30

            sorted_entries = sorted(entries, key=lambda e: e.get("spent_on", ""))
            for row_idx, entry in enumerate(sorted_entries, start=2):
                spent_on = entry.get("spent_on", "")
                try:
                    date_val: datetime | str = datetime.strptime(spent_on, "%Y-%m-%d") if spent_on else ""
                except Exception:
                    date_val = spent_on

                # Nội dung công việc = tiêu đề issue + ghi chú (comment)
                iid = entry.get("issue", {}).get("id")
                issue_subject = issue_subjects.get(iid, "") if iid else ""
                comments = entry.get("comments", "")
                work_content_parts = [p for p in [issue_subject, comments] if p]
                work_content = "\n".join(work_content_parts)

                row_data = [
                    date_val,
                    entry.get("user", {}).get("name", member_name),
                    entry.get("project", {}).get("name", ""),
                    work_content,
                    entry.get("hours", 0),
                    "",  # Người Duyệt (không có trong Redmine time entries)
                    entry.get("activity", {}).get("name", ""),
                ]
                for col_idx, value in enumerate(row_data, start=1):
                    cell = ws.cell(row=row_idx, column=col_idx, value=value)
                    cell.border = cell_border
                    if col_idx == 1:
                        cell.alignment = center_align
                        if date_val and not isinstance(date_val, str):
                            cell.number_format = "DD/MM/YYYY"
                    elif col_idx == 5:
                        cell.alignment = center_align
                    else:
                        cell.alignment = left_align
                ws.row_dimensions[row_idx].height = max(20, min(20 + len(str(work_content)) // 50 * 15, 80))

            ws.freeze_panes = "A2"

        if not wb.sheetnames:
            ws = wb.create_sheet("Không có dữ liệu")
            ws.cell(row=1, column=1, value="Không có dữ liệu trong khoảng thời gian đã chọn")

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f"LogTime_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Export OT Report to Excel ─────────────────────────────────────────────────

@router.get("/export/ot")
async def export_ot_report(
    project_ids: str = Query(default="", description="Comma-separated project identifiers; empty = all"),
    user_ids: str = Query(default="", description="Comma-separated user IDs"),
    from_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
):
    """Xuất báo cáo OT (task bắt đầu bằng [OT]) theo thành viên ra file Excel."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
        from openpyxl.utils import get_column_letter

        pids: list[Optional[str]] = [x.strip() for x in project_ids.split(",") if x.strip()] or [None]
        ids = [int(x) for x in user_ids.split(",") if x.strip().isdigit()]
        if not ids:
            raise HTTPException(status_code=400, detail="Cần chọn ít nhất một thành viên")

        today = date.today()
        end = date.fromisoformat(to_date) if to_date else today
        start = date.fromisoformat(from_date) if from_date else date(today.year, today.month, 1)

        # Get member names
        members_info: dict[int, str] = {}
        for pid in pids:
            if pid:
                try:
                    ml = await redmine_service.list_members(pid)
                    for m in ml:
                        members_info.setdefault(m["id"], m["name"])
                except Exception:
                    pass

        async def fetch_ot_entries_for_user(user_id: int) -> tuple[int, list[dict]]:
            """
            1. Fetch all time entries in date range for user across all projects.
            2. Collect unique issue IDs from those entries.
            3. Fetch each issue and keep only those with subject starting with [OT].
            4. Return filtered time entries mapped with issue info.
            """
            # Step 1: fetch time entries
            seen_entry_ids: set[int] = set()
            all_entries: list[dict] = []
            for pid in pids:
                offset = 0
                while True:
                    entries, total = await redmine_service.list_time_entries(
                        project_id=pid,
                        user_id=user_id,
                        from_date=start.isoformat(),
                        to_date=end.isoformat(),
                        limit=100,
                        offset=offset,
                    )
                    for e in entries:
                        eid = e.get("id", 0)
                        if eid not in seen_entry_ids:
                            seen_entry_ids.add(eid)
                            all_entries.append(e)
                    offset += len(entries)
                    if offset >= total or not entries:
                        break

            # Step 2: collect unique issue IDs
            issue_ids = {
                e["issue"]["id"]
                for e in all_entries
                if e.get("issue", {}).get("id")
            }

            # Step 3: fetch issues concurrently and filter [OT]
            async def fetch_issue_safe(iid: int) -> tuple[int, dict]:
                try:
                    issue = await redmine_service.get_issue(iid)
                    return iid, issue
                except Exception:
                    return iid, {}

            issue_results = await asyncio.gather(*[fetch_issue_safe(iid) for iid in issue_ids])
            ot_issues: dict[int, dict] = {
                iid: issue
                for iid, issue in issue_results
                if issue.get("subject", "").startswith("[OT]")
            }

            # Step 4: filter entries to OT issues only, attach issue data
            ot_entries: list[dict] = []
            for entry in all_entries:
                iid = entry.get("issue", {}).get("id")
                if iid and iid in ot_issues:
                    enriched = dict(entry)
                    enriched["_ot_issue"] = ot_issues[iid]
                    ot_entries.append(enriched)

            return user_id, ot_entries

        results = await asyncio.gather(*[fetch_ot_entries_for_user(uid) for uid in ids])

        # Build Excel
        wb = Workbook()
        wb.remove(wb.active)

        header_fill = PatternFill(start_color="CFE2F3", end_color="CFE2F3", fill_type="solid")
        header_font = Font(bold=True, name="Calibri", size=11)
        thin = Side(border_style="thin", color="000000")
        cell_border = Border(left=thin, right=thin, top=thin, bottom=thin)
        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left_align = Alignment(horizontal="left", vertical="top", wrap_text=True)

        HEADERS = ["Ngày OT", "Họ và Tên", "Tên dự án", "Nội dung công việc", "Số giờ ", "Người Duyệt", "Ghi chú"]
        COL_WIDTHS = [15, 22, 25, 65, 10, 20, 25]

        for user_id, entries in results:
            member_name = members_info.get(user_id, f"User_{user_id}")
            ws = wb.create_sheet(title=member_name[:31])

            for col_idx, (header, width) in enumerate(zip(HEADERS, COL_WIDTHS), start=1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = center_align
                cell.border = cell_border
                ws.column_dimensions[get_column_letter(col_idx)].width = width
            ws.row_dimensions[1].height = 30

            sorted_entries = sorted(entries, key=lambda e: e.get("spent_on", ""))
            for row_idx, entry in enumerate(sorted_entries, start=2):
                spent_on = entry.get("spent_on", "")
                try:
                    date_val: datetime | str = datetime.strptime(spent_on, "%Y-%m-%d") if spent_on else ""
                except Exception:
                    date_val = spent_on

                issue = entry.get("_ot_issue", {})
                # Strip "[OT]" prefix for work content, show issue subject + comments
                issue_subject = issue.get("subject", "")
                work_content_parts = []
                if issue_subject:
                    work_content_parts.append(issue_subject)
                comments = entry.get("comments", "")
                if comments:
                    work_content_parts.append(comments)
                work_content = "\n".join(work_content_parts)

                row_data = [
                    date_val,
                    entry.get("user", {}).get("name", member_name),
                    entry.get("project", {}).get("name", ""),
                    work_content,
                    entry.get("hours", 0),
                    "",  # Người Duyệt
                    entry.get("activity", {}).get("name", ""),
                ]
                for col_idx, value in enumerate(row_data, start=1):
                    cell = ws.cell(row=row_idx, column=col_idx, value=value)
                    cell.border = cell_border
                    if col_idx == 1:
                        cell.alignment = center_align
                        if date_val and not isinstance(date_val, str):
                            cell.number_format = "DD/MM/YYYY"
                    elif col_idx == 5:
                        cell.alignment = center_align
                    else:
                        cell.alignment = left_align
                ws.row_dimensions[row_idx].height = max(20, min(20 + len(str(work_content)) // 50 * 15, 80))

            ws.freeze_panes = "A2"

        if not wb.sheetnames:
            ws = wb.create_sheet("Không có dữ liệu")
            ws.cell(row=1, column=1, value="Không có task OT nào trong khoảng thời gian đã chọn")

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f"OT_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
