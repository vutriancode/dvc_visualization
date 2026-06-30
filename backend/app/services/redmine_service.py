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
        query_id: int | None = None,
        status_id: str = "open",
        tracker_id: int | None = None,
        priority_id: int | None = None,
        assigned_to_id: int | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        params: dict = {
            "limit": limit, "offset": offset, "status_id": status_id,
        }
        if project_id:
            params["project_id"] = project_id
        if query_id:
            params["query_id"] = query_id
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

    # ── Time Entries ──────────────────────────────────────────────────────────

    async def list_time_entries(
        self,
        project_id: str | None = None,
        user_id: int | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        params: dict = {"limit": limit, "offset": offset}
        if project_id:
            params["project_id"] = project_id
        if user_id:
            params["user_id"] = user_id
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        data = await self._request("time_entries.json", params=params)
        return data.get("time_entries", []), data.get("total_count", 0)

    async def create_time_entry(
        self,
        issue_id: int,
        hours: float,
        spent_on: str,
        activity_id: int | None = None,
        comments: str = "",
    ) -> dict:
        entry: dict = {"issue_id": issue_id, "hours": hours, "spent_on": spent_on}
        if activity_id:
            entry["activity_id"] = activity_id
        if comments:
            entry["comments"] = comments
        data = await self._request("time_entries.json", method="POST", data={"time_entry": entry})
        return data.get("time_entry", {})

    async def list_logged_issue_ids(
        self,
        project_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        user_ids: list[int] | None = None,
    ) -> list[int]:
        """Trả về danh sách issue_id đã có time entry trong khoảng thời gian."""
        issue_ids: set[int] = set()

        async def _fetch_user(uid: int | None) -> None:
            offset = 0
            while True:
                entries, total = await self.list_time_entries(
                    project_id=project_id, user_id=uid,
                    from_date=from_date, to_date=to_date,
                    limit=100, offset=offset,
                )
                for e in entries:
                    if issue := e.get("issue"):
                        issue_ids.add(issue["id"])
                offset += len(entries)
                if not entries or offset >= total:
                    break

        if user_ids:
            import asyncio as _asyncio
            await _asyncio.gather(*[_fetch_user(uid) for uid in user_ids])
        else:
            await _fetch_user(None)

        return list(issue_ids)

    async def list_time_activities(self) -> list[dict]:
        data = await self._request("enumerations/time_entry_activities.json")
        return data.get("time_entry_activities", [])

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
