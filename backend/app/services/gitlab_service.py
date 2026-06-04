import httpx
import yaml
from urllib.parse import quote
from app.models.dataset import Dataset, DatasetVersion, DvcFileMeta
from app.models.config import GitLabProject


class GitLabService:
    def _api(self, project: GitLabProject, path: str) -> str:
        pid = quote(project.project_path, safe="")
        return f"{project.gitlab_url}/api/v4/projects/{pid}{path}"

    def _headers(self, project: GitLabProject) -> dict:
        return {"PRIVATE-TOKEN": project.gitlab_token}

    async def _get(
        self,
        client: httpx.AsyncClient,
        project: GitLabProject,
        url: str,
        params: dict = None,
    ) -> dict | list:
        resp = await client.get(url, headers=self._headers(project), params=params)
        resp.raise_for_status()
        return resp.json()

    async def list_dvc_files(self, project: GitLabProject) -> list[Dataset]:
        async with httpx.AsyncClient(timeout=30) as client:
            items = await self._get(
                client, project,
                self._api(project, "/repository/tree"),
                params={"recursive": True, "per_page": 100},
            )
            dvc_files = [i for i in items if i["name"].endswith(".dvc") and i["type"] == "blob"]

            datasets = []
            for item in dvc_files:
                meta = await self._parse_dvc_file(client, project, item["path"])
                commits = await self._get_file_commits(client, project, item["path"], per_page=1)
                last = commits[0] if commits else {}

                datasets.append(Dataset(
                    id=f"{project.id}:{item['id']}",
                    name=item["name"].replace(".dvc", ""),
                    dvc_file=item["path"],
                    path=meta.path if meta else item["path"].replace(".dvc", ""),
                    md5=meta.md5 if meta else None,
                    size=meta.size if meta else None,
                    nfiles=meta.nfiles if meta else None,
                    last_modified=last.get("authored_date"),
                    last_commit_message=last.get("message", "").strip(),
                    last_author=last.get("author_name"),
                    version_count=0,
                    project_id=project.id,
                    project_name=project.name,
                ))
            return datasets

    async def get_dataset_versions(
        self, project: GitLabProject, dvc_file_path: str
    ) -> list[DatasetVersion]:
        async with httpx.AsyncClient(timeout=30) as client:
            commits = await self._get_file_commits(client, project, dvc_file_path)
            versions = []
            for commit in commits:
                meta = await self._parse_dvc_file_at_commit(
                    client, project, dvc_file_path, commit["id"]
                )
                versions.append(DatasetVersion(
                    commit_id=commit["id"],
                    commit_short=commit["short_id"],
                    message=commit.get("message", "").strip(),
                    author=commit.get("author_name", ""),
                    authored_date=commit.get("authored_date", ""),
                    dvc_path=dvc_file_path,
                    md5=meta.md5 if meta else None,
                    size=meta.size if meta else None,
                ))
            return versions

    async def get_version_count(self, project: GitLabProject, path: str) -> int:
        """Return total commit count for a file using X-Total header (single request)."""
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.get(
                    self._api(project, "/repository/commits"),
                    headers=self._headers(project),
                    params={"path": path, "per_page": 1, "page": 1},
                )
                resp.raise_for_status()
                total = resp.headers.get("X-Total")
                if total is not None:
                    return int(total)
                # Fallback: count from body
                return len(resp.json())
            except Exception:
                return 0

    async def get_project_stats(self, project: GitLabProject):
        """Fetch all datasets + version counts concurrently."""
        import asyncio
        from app.models.stats import DatasetStat, ProjectStats

        datasets = await self.list_dvc_files(project)
        if not datasets:
            return ProjectStats(
                project_id=project.id,
                project_name=project.name,
                gitlab_url=project.gitlab_url,
                project_path=project.project_path,
                total_datasets=0,
                total_size_bytes=0,
                total_versions=0,
                datasets=[],
            )

        # Fetch version counts in parallel
        counts = await asyncio.gather(
            *[self.get_version_count(project, d.dvc_file) for d in datasets]
        )

        dataset_stats = [
            DatasetStat(
                name=d.name,
                dvc_file=d.dvc_file,
                path=d.path,
                size=d.size,
                nfiles=d.nfiles,
                version_count=counts[i],
                last_modified=d.last_modified,
                last_author=d.last_author,
                last_commit_message=d.last_commit_message,
                md5=d.md5,
            )
            for i, d in enumerate(datasets)
        ]
        dataset_stats.sort(key=lambda x: x.size or 0, reverse=True)

        return ProjectStats(
            project_id=project.id,
            project_name=project.name,
            gitlab_url=project.gitlab_url,
            project_path=project.project_path,
            total_datasets=len(dataset_stats),
            total_size_bytes=sum(d.size or 0 for d in dataset_stats),
            total_versions=sum(d.version_count for d in dataset_stats),
            total_files=sum(d.nfiles or 1 for d in dataset_stats),
            datasets=dataset_stats,
        )

    async def test_connection(self, project: GitLabProject) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            data = await self._get(client, project, self._api(project, ""))
            return {"ok": True, "project": data.get("name_with_namespace", "")}

    async def _get_file_commits(
        self,
        client: httpx.AsyncClient,
        project: GitLabProject,
        path: str,
        per_page: int = 20,
    ) -> list[dict]:
        try:
            return await self._get(
                client, project,
                self._api(project, "/repository/commits"),
                params={"path": path, "per_page": per_page},
            )
        except httpx.HTTPStatusError:
            return []

    async def _parse_dvc_file(
        self, client: httpx.AsyncClient, project: GitLabProject, path: str
    ) -> DvcFileMeta | None:
        encoded = quote(path, safe="")
        try:
            resp = await client.get(
                self._api(project, f"/repository/files/{encoded}/raw"),
                headers=self._headers(project),
                params={"ref": "main"},
            )
            resp.raise_for_status()
            return self._parse_dvc_content(resp.text, path)
        except Exception:
            return None

    async def _parse_dvc_file_at_commit(
        self,
        client: httpx.AsyncClient,
        project: GitLabProject,
        path: str,
        commit_id: str,
    ) -> DvcFileMeta | None:
        encoded = quote(path, safe="")
        try:
            resp = await client.get(
                self._api(project, f"/repository/files/{encoded}/raw"),
                headers=self._headers(project),
                params={"ref": commit_id},
            )
            resp.raise_for_status()
            return self._parse_dvc_content(resp.text, path)
        except Exception:
            return None

    def _parse_dvc_content(self, content: str, dvc_path: str) -> DvcFileMeta | None:
        try:
            data = yaml.safe_load(content)
            outs = data.get("outs", [])
            if outs:
                out = outs[0]
                # nfiles is set by DVC when tracking a directory
                nfiles = out.get("nfiles")
                # If not a directory, it's exactly 1 file
                if nfiles is None and out.get("md5") and not str(out.get("md5", "")).endswith(".dir"):
                    nfiles = 1
                return DvcFileMeta(
                    md5=out.get("md5"),
                    size=out.get("size"),
                    path=out.get("path", dvc_path.replace(".dvc", "")),
                    nfiles=nfiles,
                )
        except Exception:
            pass
        return None


gitlab_service = GitLabService()
