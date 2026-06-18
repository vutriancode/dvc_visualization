"""Async Redmine REST API client."""
import httpx


class RedmineService:
    def _cfg(self):
        from app.services.config_service import config_service
        return config_service.get_redmine()

    def _headers(self, api_key: str) -> dict:
        return {"X-Redmine-API-Key": api_key, "Content-Type": "application/json"}

    async def _request(
        self, path: str, method: str = "GET",
        params: dict | None = None, data: dict | None = None,
        url_override: str = "", api_key_override: str = "",
    ) -> dict:
        cfg = self._cfg()
        base_url = (url_override or cfg.url).rstrip("/")
        api_key = api_key_override or cfg.api_key
        if not base_url:
            raise RuntimeError("Redmine URL chưa được cấu hình trong Settings")
        if not api_key:
            raise RuntimeError("Redmine API Key chưa được cấu hình trong Settings")

        async with httpx.AsyncClient(verify=cfg.verify_ssl, timeout=30) as client:
            resp = await client.request(
                method=method.upper(),
                url=f"{base_url}/{path.lstrip('/')}",
                params=params,
                json=data,
                headers=self._headers(api_key),
            )
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    # ── Projects ────────────────────────────────────────────────────────────

    async def list_projects(self, limit: int = 100, offset: int = 0) -> list[dict]:
        data = await self._request("projects.json", params={"limit": limit, "offset": offset})
        return data.get("projects", [])

    async def get_project(self, project_id: str) -> dict:
        data = await self._request(f"projects/{project_id}.json",
                                   params={"include": "trackers,issue_categories"})
        return data.get("project", {})

    # ── Issues ───────────────────────────────────────────────────────────────

    async def list_issues(
        self, project_id: str | None = None,
        status_id: str = "open",
        tracker_id: int | None = None,
        priority_id: int | None = None,
        assigned_to_id: int | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        params: dict = {
            "limit": limit, "offset": offset, "status_id": status_id,
            "include": "status",   # ensures is_closed flag is returned
        }
        if project_id:
            params["project_id"] = project_id
        if tracker_id:
            params["tracker_id"] = tracker_id
        if priority_id:
            params["priority_id"] = priority_id
        if assigned_to_id:
            params["assigned_to_id"] = assigned_to_id
        data = await self._request("issues.json", params=params)
        return data.get("issues", []), data.get("total_count", 0)

    async def get_issue(self, issue_id: int) -> dict:
        data = await self._request(
            f"issues/{issue_id}.json",
            params={"include": "journals,relations,children,attachments"},
        )
        return data.get("issue", {})

    async def create_issue(
        self, project_id: str, subject: str,
        description: str = "",
        tracker_id: int | None = None,
        status_id: int | None = None,
        priority_id: int | None = None,
        assigned_to_id: int | None = None,
        due_date: str | None = None,
        estimated_hours: float | None = None,
        parent_issue_id: int | None = None,
    ) -> dict:
        issue: dict = {"project_id": project_id, "subject": subject}
        if description:
            issue["description"] = description
        if tracker_id is not None:
            issue["tracker_id"] = tracker_id
        if status_id is not None:
            issue["status_id"] = status_id
        if priority_id is not None:
            issue["priority_id"] = priority_id
        if assigned_to_id is not None:
            issue["assigned_to_id"] = assigned_to_id
        if due_date:
            issue["due_date"] = due_date
        if estimated_hours is not None:
            issue["estimated_hours"] = estimated_hours
        if parent_issue_id is not None:
            issue["parent_issue_id"] = parent_issue_id
        data = await self._request("issues.json", method="POST", data={"issue": issue})
        return data.get("issue", {})

    async def update_issue(
        self, issue_id: int,
        subject: str | None = None,
        description: str | None = None,
        status_id: int | None = None,
        priority_id: int | None = None,
        assigned_to_id: int | None = None,
        tracker_id: int | None = None,
        done_ratio: int | None = None,
        due_date: str | None = None,
        estimated_hours: float | None = None,
        notes: str | None = None,
    ) -> None:
        issue: dict = {}
        if subject is not None:
            issue["subject"] = subject
        if description is not None:
            issue["description"] = description
        if status_id is not None:
            issue["status_id"] = status_id
        if priority_id is not None:
            issue["priority_id"] = priority_id
        if assigned_to_id is not None:
            issue["assigned_to_id"] = assigned_to_id
        if tracker_id is not None:
            issue["tracker_id"] = tracker_id
        if done_ratio is not None:
            issue["done_ratio"] = done_ratio
        if due_date is not None:
            issue["due_date"] = due_date
        if estimated_hours is not None:
            issue["estimated_hours"] = estimated_hours
        if notes is not None:
            issue["notes"] = notes
        await self._request(f"issues/{issue_id}.json", method="PUT", data={"issue": issue})

    async def delete_issue(self, issue_id: int) -> None:
        await self._request(f"issues/{issue_id}.json", method="DELETE")

    # ── Metadata ─────────────────────────────────────────────────────────────

    async def list_trackers(self) -> list[dict]:
        data = await self._request("trackers.json")
        return data.get("trackers", [])

    async def list_statuses(self) -> list[dict]:
        data = await self._request("issue_statuses.json")
        return data.get("issue_statuses", [])

    async def list_priorities(self) -> list[dict]:
        data = await self._request("enumerations/issue_priorities.json")
        return data.get("issue_priorities", [])

    async def list_members(self, project_id: str) -> list[dict]:
        data = await self._request(f"projects/{project_id}/memberships.json", params={"limit": 100})
        return [
            {"id": m["user"]["id"], "name": m["user"]["name"]}
            for m in data.get("memberships", [])
            if "user" in m
        ]

    async def get_current_user(self) -> dict:
        data = await self._request("users/current.json")
        return data.get("user", {})

    # ── Test connection ───────────────────────────────────────────────────────

    async def test_connection(self, url: str, api_key: str) -> dict:
        try:
            user_data = await self._request(
                "users/current.json",
                url_override=url, api_key_override=api_key,
            )
            user = user_data.get("user", {})
            return {
                "ok": True,
                "user": user.get("login", ""),
                "name": user.get("firstname", "") + " " + user.get("lastname", ""),
            }
        except Exception as e:
            raise RuntimeError(str(e))


redmine_service = RedmineService()
