"""Async CVAT REST API client."""
import asyncio
import httpx
from datetime import datetime
from urllib.parse import quote


class CVATService:

    def _cfg(self):
        from app.services.config_service import config_service
        return config_service.get_cvat()

    async def _get_token(self, url: str, username: str, password: str, verify_ssl: bool) -> str:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=15) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/api/auth/login",
                json={"username": username, "password": password},
            )
            resp.raise_for_status()
            return resp.json()["key"]

    async def _request(
        self, path: str, method: str = "GET",
        params: dict | None = None, data: dict | None = None,
        url_override: str = "", username_override: str = "", password_override: str = "",
    ) -> dict:
        cfg = self._cfg()
        base_url = (url_override or cfg.url).rstrip("/")
        username = username_override or cfg.username
        password = password_override or cfg.password
        if not base_url:
            raise RuntimeError("CVAT URL chưa được cấu hình")
        if not username:
            raise RuntimeError("CVAT username chưa được cấu hình")

        token = await self._get_token(base_url, username, password, cfg.verify_ssl)
        headers = {"Authorization": f"Token {token}", "Content-Type": "application/json"}

        async with httpx.AsyncClient(verify=cfg.verify_ssl, timeout=30) as client:
            resp = await client.request(
                method=method.upper(),
                url=f"{base_url}/{path.lstrip('/')}",
                params=params,
                json=data,
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    async def test_connection(self, url: str, username: str, password: str) -> dict:
        token = await self._get_token(url, username, password, True)
        cfg = self._cfg()
        async with httpx.AsyncClient(verify=cfg.verify_ssl, timeout=15) as client:
            resp = await client.get(
                f"{url.rstrip('/')}/api/users/self",
                headers={"Authorization": f"Token {token}"},
            )
            resp.raise_for_status()
            user = resp.json()
            return {
                "ok": True,
                "username": user.get("username"),
                "name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
            }

    async def list_projects(self) -> list[dict]:
        results = []
        page = 1
        while True:
            data = await self._request("api/projects", params={"page": page, "page_size": 100})
            results.extend(data.get("results", []))
            if not data.get("next"):
                break
            page += 1
        return results

    async def list_tasks(self, project_id: int | None = None) -> list[dict]:
        params: dict = {"page_size": 100}
        if project_id:
            params["project_id"] = project_id
        results = []
        page = 1
        while True:
            params["page"] = page
            data = await self._request("api/tasks", params=params)
            results.extend(data.get("results", []))
            if not data.get("next"):
                break
            page += 1
        return results

    async def list_jobs(self, project_id: int | None = None, task_id: int | None = None) -> list[dict]:
        params: dict = {"page_size": 100}
        if project_id:
            params["project_id"] = project_id
        if task_id:
            params["task_id"] = task_id
        results = []
        page = 1
        while True:
            params["page"] = page
            data = await self._request("api/jobs", params=params)
            results.extend(data.get("results", []))
            if not data.get("next"):
                break
            page += 1
        return results

    async def list_users(self) -> list[dict]:
        data = await self._request("api/users", params={"page_size": 100})
        return data.get("results", [])

    async def export_single_job(
        self, job_id: int, format_name: str, save_images: bool = True,
    ) -> bytes:
        """Export one CVAT job using the ≥2.31 async API. Returns ZIP bytes.

        Flow:
          POST /api/jobs/{id}/dataset/export?save_images=...&format=...
            → 202 {"rq_id": "..."}
          GET  /api/requests/{rq_id}  → {"status": "finished", "result_url": "..."}
          GET  {result_url}           → binary ZIP
        """
        cfg = self._cfg()
        base_url = cfg.url.rstrip("/")
        token = await self._get_token(base_url, cfg.username, cfg.password, cfg.verify_ssl)
        headers = {"Authorization": f"Token {token}"}

        async with httpx.AsyncClient(verify=cfg.verify_ssl, timeout=60) as client:
            r = await client.post(
                f"{base_url}/api/jobs/{job_id}/dataset/export",
                params={"save_images": str(save_images).lower(), "format": format_name},
                headers=headers,
            )
            r.raise_for_status()
            rq_id = r.json()["rq_id"]

            rq_url = f"{base_url}/api/requests/{quote(rq_id, safe='')}"
            result_url: str | None = None
            for i in range(300):
                r2 = await client.get(rq_url, headers=headers)
                r2.raise_for_status()
                info = r2.json()
                if info.get("status") == "finished":
                    result_url = info["result_url"]
                    break
                if info.get("status") == "failed":
                    raise RuntimeError(f"Job {job_id} export failed: {info.get('message', '')}")
                await asyncio.sleep(2 if i < 10 else 5)
            else:
                raise RuntimeError(f"Job {job_id} export timed out sau 10 phút")

        async with httpx.AsyncClient(verify=cfg.verify_ssl, timeout=300) as dl:
            resp = await dl.get(result_url, headers=headers, follow_redirects=True)
            resp.raise_for_status()
            return resp.content

    async def export_dataset(
        self, project_id: int, format_name: str = "CVAT for images 1.1",
        progress_cb=None, save_images: bool = True,
    ) -> bytes:
        """Export ALL completed jobs and merge into one ZIP (legacy helper).
        Uses export_single_job internally with concurrency=2.
        """
        import io
        import zipfile

        jobs = await self.list_jobs(project_id=project_id)
        completed = [j for j in jobs if (j.get("state") or j.get("status")) == "completed"]
        if not completed:
            raise RuntimeError("Không có job nào hoàn thành (completed) để xuất")

        total = len(completed)
        if progress_cb:
            progress_cb(f"0/{total} jobs")

        sem = asyncio.Semaphore(2)
        done_count = 0

        async def _one(job: dict) -> tuple[dict, bytes]:
            nonlocal done_count
            async with sem:
                data = await self.export_single_job(job["id"], format_name, save_images)
                done_count += 1
                if progress_cb:
                    progress_cb(f"{done_count}/{total} jobs")
                return job, data

        results = await asyncio.gather(*[_one(j) for j in completed])

        merged = io.BytesIO()
        with zipfile.ZipFile(merged, "w", zipfile.ZIP_DEFLATED) as out_zip:
            for job, data in results:
                with zipfile.ZipFile(io.BytesIO(data)) as in_zip:
                    for name in in_zip.namelist():
                        out_zip.writestr(f"job_{job['id']}/{name}", in_zip.read(name))
        return merged.getvalue()


cvat_service = CVATService()
