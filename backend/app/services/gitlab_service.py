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

    async def list_branches(self, project: GitLabProject) -> list[str]:
        """Return all branch names for a project, sorted (default branch first)."""
        async with httpx.AsyncClient(timeout=15) as client:
            branches: list[str] = []
            default = ""
            page = 1
            while True:
                try:
                    resp = await client.get(
                        self._api(project, "/repository/branches"),
                        headers=self._headers(project),
                        params={"per_page": 100, "page": page},
                    )
                    resp.raise_for_status()
                    batch = resp.json()
                    if not batch:
                        break
                    for b in batch:
                        branches.append(b["name"])
                        if b.get("default"):
                            default = b["name"]
                    if not resp.headers.get("X-Next-Page"):
                        break
                    page += 1
                except Exception:
                    break
            # Put default branch first
            if default and default in branches:
                branches.remove(default)
                branches.insert(0, default)
            return branches

    async def _get_all_tree_items(
        self, client: httpx.AsyncClient, project: GitLabProject, ref: str
    ) -> list[dict]:
        """Fetch every item in the repo tree, paginating through all pages."""
        all_items: list[dict] = []
        page = 1
        while True:
            try:
                resp = await client.get(
                    self._api(project, "/repository/tree"),
                    headers=self._headers(project),
                    params={"recursive": True, "per_page": 100, "page": page, "ref": ref},
                )
                resp.raise_for_status()
                batch: list[dict] = resp.json()
                if not batch:
                    break
                all_items.extend(batch)
                if not resp.headers.get("X-Next-Page"):
                    break
                page += 1
            except Exception:
                break
        return all_items

    async def list_dvc_files(self, project: GitLabProject, branch_override: str = "") -> list[Dataset]:
        ref = branch_override or project.branch or "HEAD"
        if project.source_type == "group":
            return await self._list_group_dvc_files(project, ref)
        async with httpx.AsyncClient(timeout=30) as client:
            return await self._scan_project_dvc_files(client, project, project.id, project.name, ref)

    async def _list_group_dvc_files(self, group: GitLabProject, branch_override: str = "HEAD") -> list[Dataset]:
        sub_projects = await self.list_group_projects(group)
        import asyncio
        results = await asyncio.gather(
            *[self._scan_single_group_project(group, gp, branch_override) for gp in sub_projects],
            return_exceptions=True,
        )
        datasets = []
        for r in results:
            if isinstance(r, list):
                datasets.extend(r)
        return datasets

    async def _scan_single_group_project(self, group: GitLabProject, gp: dict, branch_override: str = "HEAD") -> list[Dataset]:
        sub = GitLabProject(
            id=group.id,
            name=gp.get("name_with_namespace", gp.get("name", "")),
            gitlab_url=group.gitlab_url,
            gitlab_token=group.gitlab_token,
            project_path=gp["path_with_namespace"],
            source_type="project",
        )
        async with httpx.AsyncClient(timeout=30) as client:
            return await self._scan_project_dvc_files(client, sub, group.id, sub.name, branch_override)

    async def _scan_project_dvc_files(
        self,
        client: httpx.AsyncClient,
        project: GitLabProject,
        group_id: str,
        display_name: str,
        default_branch: str = "main",
    ) -> list[Dataset]:
        items = await self._get_all_tree_items(client, project, default_branch)
        dvc_files = [i for i in items if i["name"].endswith(".dvc") and i["type"] == "blob"]

        datasets = []
        for item in dvc_files:
            meta = await self._parse_dvc_file(client, project, item["path"], default_branch)
            commits = await self._get_file_commits(client, project, item["path"], per_page=1)
            last = commits[0] if commits else {}

            datasets.append(Dataset(
                id=f"{group_id}:{project.project_path}:{item['id']}",
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
                project_id=group_id,
                project_name=display_name,
                gitlab_url=project.gitlab_url,
                repo_path=project.project_path,
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

    async def list_group_projects(self, group: GitLabProject) -> list[dict]:
        """Return all projects in a group and its subgroups."""
        gid = quote(group.project_path, safe="")
        url = f"{group.gitlab_url}/api/v4/groups/{gid}/projects"
        async with httpx.AsyncClient(timeout=30) as client:
            all_projects: list[dict] = []
            page = 1
            while True:
                resp = await client.get(
                    url,
                    headers=self._headers(group),
                    params={"include_subgroups": True, "with_shared": False, "per_page": 100, "page": page},
                )
                resp.raise_for_status()
                batch: list[dict] = resp.json()
                if not batch:
                    break
                all_projects.extend(batch)
                if len(batch) < 100:
                    break
                page += 1
            return all_projects

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
                return len(resp.json())
            except Exception:
                return 0

    def _sub_path_for(self, project: GitLabProject, d) -> str:
        """Extract sub-project path from a group-scanned dataset id."""
        parts = d.id.split(":", 2)
        return parts[1] if len(parts) == 3 else project.project_path

    def _make_sub_project(self, group: GitLabProject, sub_path: str) -> GitLabProject:
        return GitLabProject(
            id=group.id,
            name="",
            gitlab_url=group.gitlab_url,
            gitlab_token=group.gitlab_token,
            project_path=sub_path,
            source_type="project",
        )

    async def _get_version_count_for_dataset(self, group: GitLabProject, sub_path: str, dvc_file: str) -> int:
        if group.source_type == "group":
            return await self.get_version_count(self._make_sub_project(group, sub_path), dvc_file)
        return await self.get_version_count(group, dvc_file)

    async def _get_commits_for_dataset(self, group: GitLabProject, sub_path: str, dvc_file: str) -> list[dict]:
        proj = self._make_sub_project(group, sub_path) if group.source_type == "group" else group
        async with httpx.AsyncClient(timeout=30) as client:
            return await self._get_file_commits(client, proj, dvc_file, per_page=50)

    async def get_project_stats(self, project: GitLabProject):
        """Fetch all datasets + version counts + author stats concurrently."""
        import asyncio
        from collections import defaultdict
        from app.models.stats import DatasetStat, ProjectStats, AuthorStat

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

        sub_paths = [self._sub_path_for(project, d) for d in datasets]

        counts, commit_lists = await asyncio.gather(
            asyncio.gather(*[
                self._get_version_count_for_dataset(project, sub_paths[i], d.dvc_file)
                for i, d in enumerate(datasets)
            ]),
            asyncio.gather(*[
                self._get_commits_for_dataset(project, sub_paths[i], d.dvc_file)
                for i, d in enumerate(datasets)
            ]),
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

        # Aggregate per-author stats from commit history
        author_agg: dict[str, dict] = defaultdict(lambda: {"commits": 0, "datasets": set(), "bytes": 0})
        for d, commits in zip(datasets, commit_lists):
            seen = set()
            for commit in commits:
                author = commit.get("author_name") or "Unknown"
                author_agg[author]["commits"] += 1
                seen.add(author)
            # Credit dataset size to authors who touched it
            for author in seen:
                author_agg[author]["datasets"].add(d.name)
        # Credit full dataset size to its last author (current data owner)
        for d in datasets:
            if d.last_author and d.size:
                author_agg[d.last_author]["bytes"] += d.size

        author_stats = sorted(
            [
                AuthorStat(
                    author=author,
                    commits=v["commits"],
                    datasets_touched=len(v["datasets"]),
                    total_data_bytes=v["bytes"],
                )
                for author, v in author_agg.items()
            ],
            key=lambda x: x.commits,
            reverse=True,
        )

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
            author_stats=author_stats,
        )

    async def test_connection(self, project: GitLabProject) -> dict:
        if project.source_type == "group":
            async with httpx.AsyncClient(timeout=10) as client:
                gid = quote(project.project_path, safe="")
                url = f"{project.gitlab_url}/api/v4/groups/{gid}"
                resp = await client.get(url, headers=self._headers(project))
                resp.raise_for_status()
                data = resp.json()
                return {"ok": True, "project": data.get("full_name", data.get("name", ""))}
        async with httpx.AsyncClient(timeout=10) as client:
            data = await self._get(client, project, self._api(project, ""))
            return {"ok": True, "project": data.get("name_with_namespace", "")}

    async def fetch_dvc_remote_config(self, project: GitLabProject) -> dict | None:
        """Read .dvc/config from the repo and return the default remote's config dict."""
        import configparser
        encoded = quote(".dvc/config", safe="")
        async with httpx.AsyncClient(timeout=10) as client:
            text = None
            for ref in ("main", "master", "HEAD"):
                try:
                    resp = await client.get(
                        self._api(project, f"/repository/files/{encoded}/raw"),
                        headers=self._headers(project),
                        params={"ref": ref},
                    )
                    if resp.status_code == 200:
                        text = resp.text
                        break
                except Exception:
                    continue
            if not text:
                return None

        parser = configparser.RawConfigParser()
        parser.read_string(text)

        # Get default remote name from [core]
        remote_name = None
        if parser.has_section("core") and parser.has_option("core", "remote"):
            remote_name = parser.get("core", "remote").strip()

        if not remote_name:
            # Pick the first remote section found
            for section in parser.sections():
                clean = section.strip("'\"")
                if clean.startswith("remote "):
                    remote_name = clean.split('"')[1] if '"' in clean else clean[7:]
                    break

        if not remote_name:
            return None

        # Find the matching remote section (DVC wraps the name in single quotes + double quotes)
        for section in parser.sections():
            clean = section.strip("'")
            if clean == f'remote "{remote_name}"' or clean == f"remote '{remote_name}'":
                return dict(parser.items(section))

        return None

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
        self, client: httpx.AsyncClient, project: GitLabProject, path: str, ref: str = "main"
    ) -> DvcFileMeta | None:
        encoded = quote(path, safe="")
        try:
            resp = await client.get(
                self._api(project, f"/repository/files/{encoded}/raw"),
                headers=self._headers(project),
                params={"ref": ref},
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


    async def list_accessible_projects(self, gitlab_url: str, token: str, search: str = "") -> list[dict]:
        """List projects accessible with this token (for repo picker)."""
        import re as _re
        headers = {"PRIVATE-TOKEN": token}
        params: dict = {"per_page": 50, "order_by": "last_activity_at", "membership": True, "min_access_level": 30}
        if search:
            params["search"] = search
        async with httpx.AsyncClient(timeout=15) as client:
            try:
                resp = await client.get(f"{gitlab_url}/api/v4/projects", headers=headers, params=params)
                resp.raise_for_status()
                return [
                    {"id": p["id"], "name": p["name_with_namespace"], "path": p["path_with_namespace"]}
                    for p in resp.json()
                ]
            except Exception as e:
                raise RuntimeError(str(e))

    async def check_can_create_project(self, gitlab_url: str, token: str) -> dict:
        """Return GitLab user info relevant to project creation."""
        headers = {"PRIVATE-TOKEN": token}
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(f"{gitlab_url}/api/v4/user", headers=headers)
                resp.raise_for_status()
                u = resp.json()
                return {
                    "username": u.get("username", ""),
                    "can_create_project": u.get("can_create_project", True),
                    "projects_limit": u.get("projects_limit", -1),
                }
            except Exception:
                return {"can_create_project": True}  # optimistic — let the actual call fail

    async def create_project(
        self, gitlab_url: str, token: str, name: str, namespace_path: str = ""
    ) -> dict:
        """Create a new GitLab project initialized with a README. Returns project info."""
        import re as _re
        headers = {"PRIVATE-TOKEN": token}

        # Pre-flight: check if the user is allowed to create projects at all
        user_info = await self.check_can_create_project(gitlab_url, token)
        if not user_info.get("can_create_project", True):
            raise RuntimeError(
                f"Tài khoản GitLab '{user_info.get('username', '')}' bị giới hạn tạo project "
                f"(can_create_project = false). Hãy nhờ GitLab admin mở quyền, "
                f"hoặc tạo repo thủ công trên GitLab rồi chọn 'Nhập đường dẫn repo'."
            )

        path_slug = _re.sub(r"[^a-zA-Z0-9_.-]", "-", name).strip("-") or "dataset-repo"
        payload: dict = {
            "name": name,
            "path": path_slug,
            "initialize_with_readme": True,
            "default_branch": "main",
        }
        if namespace_path:
            async with httpx.AsyncClient(timeout=10) as client:
                ns_resp = await client.get(
                    f"{gitlab_url}/api/v4/namespaces",
                    headers=headers,
                    params={"search": namespace_path},
                )
                ns_resp.raise_for_status()
                ns_list = ns_resp.json()
                ns = next(
                    (n for n in ns_list if n.get("full_path") == namespace_path or n.get("path") == namespace_path),
                    None,
                )
                if ns:
                    payload["namespace_id"] = ns["id"]
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{gitlab_url}/api/v4/projects", headers=headers, json=payload)
            if resp.status_code == 403:
                # Extract GitLab's own error message from the response body
                detail = ""
                try:
                    body = resp.json()
                    detail = body.get("message", "") or str(body)
                except Exception:
                    detail = resp.text[:300]
                raise RuntimeError(
                    f"GitLab từ chối tạo project (403): {detail}\n"
                    "Nguyên nhân thường gặp:\n"
                    "• Admin giới hạn số project hoặc tắt tạo project cho user thường\n"
                    "• Namespace không tồn tại hoặc bạn không phải Maintainer/Owner của group đó\n"
                    "→ Giải pháp: Tạo repo thủ công trên GitLab, sau đó chọn 'Nhập đường dẫn repo'."
                )
            resp.raise_for_status()
            p = resp.json()
            return {
                "id": p["id"],
                "path_with_namespace": p["path_with_namespace"],
                "default_branch": p.get("default_branch", "main"),
                "http_url_to_repo": p.get("http_url_to_repo", ""),
            }

    async def get_file_content(self, project: GitLabProject, path: str, ref: str = "HEAD") -> str | None:
        """Fetch raw file content. Returns None if file does not exist."""
        encoded = quote(path, safe="")
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    self._api(project, f"/repository/files/{encoded}/raw"),
                    headers=self._headers(project),
                    params={"ref": ref},
                )
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.text
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return None
                raise

    async def get_default_branch(self, project: GitLabProject) -> str:
        """Return the default branch of the project (e.g. 'main' or 'master')."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                self._api(project, ""),
                headers=self._headers(project),
            )
            resp.raise_for_status()
            return resp.json().get("default_branch") or "main"

    async def commit_files(
        self,
        project: GitLabProject,
        branch: str,
        message: str,
        actions: list[dict],
    ) -> dict:
        """Commit one or more file actions (create/update) to a GitLab repo."""
        payload = {"branch": branch, "commit_message": message, "actions": actions}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self._api(project, "/repository/commits"),
                headers=self._headers(project),
                json=payload,
            )
            if not resp.is_success:
                try:
                    detail = resp.json()
                except Exception:
                    detail = resp.text
                raise RuntimeError(
                    f"GitLab commit trả về {resp.status_code}: {detail}"
                )
            return resp.json()


gitlab_service = GitLabService()
