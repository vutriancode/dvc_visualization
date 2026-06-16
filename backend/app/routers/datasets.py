import hashlib
import json

import yaml
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from typing import Annotated

from app.services.gitlab_service import gitlab_service
from app.services.minio_service import minio_service
from app.services.ssh_service import ssh_service
from app.services.gdrive_service import gdrive_service
from app.services.config_service import config_service
from app.models import Dataset, DatasetDetail, MinioObject, StatsResponse

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


async def _get_datasets(
    project_id: str | None,
    search: str,
    branch: str = "",
    sub_repo: str = "",
) -> list[Dataset]:
    """Fetch datasets from one project or all projects.
    sub_repo: when set, scan only this repo_path within a group (with the given branch).
    """
    projects = config_service.list_projects()
    if not projects:
        return []

    if project_id and project_id != "all":
        project = config_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        projects = [project]

    all_datasets: list[Dataset] = []
    for project in projects:
        try:
            if sub_repo and project.source_type == "group":
                from app.models.config import GitLabProject as GP
                sub = GP(
                    id=project.id, name=sub_repo, gitlab_url=project.gitlab_url,
                    gitlab_token=project.gitlab_token, project_path=sub_repo, source_type="project",
                )
                datasets = await gitlab_service.list_dvc_files(sub, branch_override=branch)
            else:
                datasets = await gitlab_service.list_dvc_files(project, branch_override=branch)
            all_datasets.extend(datasets)
        except Exception:
            continue

    # Append SSH + rclone datasets when viewing all projects
    if not project_id or project_id == "all":
        from app.models.dataset import Dataset as DS
        for ssh_ds in config_service.list_ssh_datasets():
            all_datasets.append(DS(
                id=f"ssh:{ssh_ds.id}",
                name=ssh_ds.name,
                dvc_file="",
                path=ssh_ds.path,
                source_type="ssh",
                project_id="ssh",
                project_name="SSH Storage",
            ))
        for rc_ds in config_service.list_rclone_datasets():
            from app.services.rclone_service import PROVIDERS
            label = PROVIDERS.get(rc_ds.provider, {}).get("label", rc_ds.provider)
            all_datasets.append(DS(
                id=f"rclone:{rc_ds.id}",
                name=rc_ds.name,
                dvc_file="",
                path=rc_ds.path,
                source_type="rclone",
                project_id="rclone",
                project_name=label,
                rclone_remote=rc_ds.remote,
                provider=rc_ds.provider,
            ))

    if search:
        all_datasets = [d for d in all_datasets if search.lower() in d.name.lower()]

    return all_datasets


@router.get("", response_model=list[Dataset])
async def list_datasets(
    project_id: str = Query(default="all", description="Project ID or 'all'"),
    search: str = Query(default=""),
    branch: str = Query(default="", description="Branch name override"),
    sub_repo: str = Query(default="", description="Specific sub-project path within a group"),
):
    try:
        return await _get_datasets(project_id, search, branch, sub_repo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    try:
        datasets = await _get_datasets("all", "")
        minio = config_service.get_minio()
        return StatsResponse(
            total_datasets=len(datasets),
            total_size_bytes=sum(d.size or 0 for d in datasets),
            total_projects=len(config_service.list_projects()),
            minio_bucket=minio.bucket,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{project_id}/{dataset_name}/versions", response_model=DatasetDetail)
async def get_dataset_versions(project_id: str, dataset_name: str):
    try:
        project = config_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        datasets = await gitlab_service.list_dvc_files(project)
        dataset = next((d for d in datasets if d.name == dataset_name), None)
        if not dataset:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        versions = await gitlab_service.get_dataset_versions(project, dataset.dvc_file)
        return DatasetDetail(**dataset.model_dump(), versions=versions)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{project_id}/{dataset_name}/files", response_model=list[MinioObject])
async def list_dataset_files(project_id: str, dataset_name: str):
    try:
        project = config_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        datasets = await gitlab_service.list_dvc_files(project)
        dataset = next((d for d in datasets if d.name == dataset_name), None)
        if not dataset:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        return minio_service.list_objects(prefix=dataset.path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{project_id}/{dataset_name}/download")
async def get_download_url(project_id: str, dataset_name: str, object_name: str = Query(...)):
    try:
        url = minio_service.get_presigned_url(object_name)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{project_id}/{dataset_name}/presigned-urls")
async def get_all_presigned_urls(project_id: str, dataset_name: str):
    """Return presigned download URLs using DVC md5.
    Config priority: app MinIO settings → .dvc/config in the repo.
    """
    try:
        project = config_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        datasets = await gitlab_service.list_dvc_files(project)
        dataset = next((d for d in datasets if d.name == dataset_name), None)
        if not dataset:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

        if not dataset.md5:
            raise HTTPException(status_code=404, detail="No MD5 found in .dvc file.")

        # 1. Try app-level MinIO config
        minio_cfg = config_service.get_minio()
        if minio_cfg.endpoint and minio_cfg.access_key and minio_cfg.secret_key:
            return minio_service.presigned_urls_for_md5(
                md5=dataset.md5,
                display_name=dataset.name,
                total_size=dataset.size,
            )

        # 2. Fallback: read .dvc/config from the repo that owns this dataset
        from app.models.config import GitLabProject as GP
        repo_project = GP(
            id=project.id,
            name="",
            gitlab_url=dataset.gitlab_url or project.gitlab_url,
            gitlab_token=project.gitlab_token,
            project_path=dataset.repo_path or project.project_path,
            source_type="project",
        )
        dvc_remote = await gitlab_service.fetch_dvc_remote_config(repo_project)
        if not dvc_remote:
            raise HTTPException(
                status_code=400,
                detail="No storage configured in app settings and no .dvc/config found in the repository.",
            )

        remote_url = dvc_remote.get("url", "")

        # SSH remote
        if remote_url.startswith("ssh://"):
            ssh_cfg = config_service.get_ssh()
            if not ssh_cfg.host or not ssh_cfg.username:
                raise HTTPException(
                    status_code=400,
                    detail=".dvc/config uses SSH remote but SSH storage is not configured in Settings.",
                )
            return ssh_service.generate_urls(
                cfg=ssh_cfg,
                md5=dataset.md5,
                display_name=dataset.name,
                total_size=dataset.size,
            )

        # Google Drive remote
        if remote_url.startswith("gdrive://"):
            gdrive_cfg = config_service.get_gdrive()
            if not gdrive_cfg.refresh_token:
                raise HTTPException(
                    status_code=400,
                    detail=".dvc/config uses Google Drive remote but Google Drive is not connected in Settings.",
                )
            folder_id = gdrive_cfg.folder_id or remote_url.replace("gdrive://", "").split("/")[0]
            from app.models.config import GDriveConfig
            effective_cfg = GDriveConfig(
                folder_id=folder_id,
                client_id=gdrive_cfg.client_id,
                client_secret=gdrive_cfg.client_secret,
                refresh_token=gdrive_cfg.refresh_token,
            )
            return gdrive_service.generate_urls(
                cfg=effective_cfg,
                md5=dataset.md5,
                display_name=dataset.name,
                total_size=dataset.size,
            )

        # S3 / MinIO remote
        endpoint_host, _, _, _ = minio_service._parse_dvc_remote(dvc_remote)
        if not endpoint_host:
            raise HTTPException(
                status_code=400,
                detail=".dvc/config found but 'endpointurl' is missing. Cannot determine storage endpoint.",
            )

        return minio_service.presigned_urls_from_dvc_remote(
            dvc_remote=dvc_remote,
            md5=dataset.md5,
            display_name=dataset.name,
            total_size=dataset.size,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/create-dvc", status_code=201)
async def create_dvc_dataset(
    project_id: Annotated[str, Form(description="Configured GitLab project ID (for credentials)")],
    repo_path: Annotated[str, Form(description="Target repo path_with_namespace (or new repo name when create_new_repo=true)")],
    dataset_name: Annotated[str, Form(description="Dataset name (becomes folder name and .dvc file)")],
    files: Annotated[list[UploadFile], File(description="Files to upload")],
    create_new_repo: Annotated[bool, Form()] = False,
    namespace_path: Annotated[str, Form()] = "",
    branch: Annotated[str, Form()] = "main",
    commit_message: Annotated[str, Form()] = "",
):
    """Full DVC workflow: stream files to MinIO, commit .dvc tracking metadata to GitLab."""
    import os
    import tempfile
    from app.models.config import GitLabProject as GP

    if not dataset_name.strip():
        raise HTTPException(status_code=400, detail="dataset_name is required")
    if not files:
        raise HTTPException(status_code=400, detail="At least one file must be uploaded")

    # 1. Get parent project credentials
    parent = config_service.get_project(project_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Project not found")

    # 2. Verify MinIO is configured
    minio_cfg = config_service.get_minio()
    if not (minio_cfg.endpoint and minio_cfg.access_key and minio_cfg.secret_key):
        raise HTTPException(status_code=400, detail="MinIO is not configured in Settings")

    # 3. Create new GitLab repo if requested
    actual_repo_path = repo_path.strip("/")
    used_branch = branch or "main"
    new_repo_created = False

    if create_new_repo:
        try:
            new_proj = await gitlab_service.create_project(
                parent.gitlab_url, parent.gitlab_token, repo_path, namespace_path
            )
            actual_repo_path = new_proj["path_with_namespace"]
            used_branch = new_proj["default_branch"]
            new_repo_created = True
            from app.models.config import GitLabProjectCreate
            config_service.add_project(GitLabProjectCreate(
                name=actual_repo_path.split("/")[-1],
                gitlab_url=parent.gitlab_url,
                gitlab_token=parent.gitlab_token,
                project_path=actual_repo_path,
                source_type="project",
                branch="",
            ))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to create GitLab repo: {e}")

    # 4. Build GitLabProject pointing at the target repo
    target = GP(
        id=parent.id,
        name=actual_repo_path,
        gitlab_url=parent.gitlab_url,
        gitlab_token=parent.gitlab_token,
        project_path=actual_repo_path,
        source_type="project",
    )

    # 5. Stream each uploaded file to a temp file while computing MD5, then push to MinIO.
    #    Reading in chunks keeps memory flat even for GB-sized files.
    entries: list[dict] = []
    total_size = 0
    tmp_paths: list[str] = []
    try:
        for upload in files:
            md5_hasher = hashlib.md5()
            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp_path = tmp.name
                tmp_paths.append(tmp_path)
                chunk_size = 1024 * 1024  # 1 MiB
                while True:
                    chunk = await upload.read(chunk_size)
                    if not chunk:
                        break
                    md5_hasher.update(chunk)
                    tmp.write(chunk)

            file_size = os.path.getsize(tmp_path)
            md5 = md5_hasher.hexdigest()
            fname = upload.filename or md5

            with open(tmp_path, "rb") as f:
                minio_service.upload_dvc_stream(md5, f, file_size)

            entries.append({"md5": md5, "relpath": fname, "size": file_size})
            total_size += file_size
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MinIO upload failed: {e}")
    finally:
        for p in tmp_paths:
            try:
                os.unlink(p)
            except OSError:
                pass

    # 6. Build directory manifest (.dir) and upload to MinIO
    entries_sorted = sorted(entries, key=lambda e: e["relpath"])
    manifest_bytes = json.dumps(entries_sorted).encode()
    manifest_md5 = hashlib.md5(manifest_bytes).hexdigest()
    try:
        minio_service.upload_dvc_object(manifest_md5, manifest_bytes)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MinIO manifest upload failed: {e}")

    # 7. Build .dvc YAML (directory-style tracking)
    dvc_file_path = f"{dataset_name}.dvc"
    dvc_content = yaml.dump(
        {
            "outs": [{
                "md5": f"{manifest_md5}.dir",
                "size": total_size,
                "nfiles": len(entries),
                "path": dataset_name,
            }]
        },
        default_flow_style=False,
        allow_unicode=True,
    )

    # 8. Fetch existing files to determine create vs update actions
    existing = await _fetch_existing(gitlab_service, target, used_branch, [
        dvc_file_path,
        ".gitignore",
        ".dvc/config",
        ".dvc/.gitignore",
    ])

    actions: list[dict] = []

    # .dvc tracking file
    actions.append({
        "action": "update" if existing[dvc_file_path] else "create",
        "file_path": dvc_file_path,
        "content": dvc_content,
    })

    # Root .gitignore — append dataset entry + DVC cache entries
    gi_lines: list[str] = []
    if existing[".gitignore"]:
        gi_lines = existing[".gitignore"].splitlines()
    dvc_gi_entries = [
        f"/{dataset_name}",
        "/.dvc/tmp",
        "/.dvc/cache",
        "/.dvc/plots",
    ]
    added_gi = False
    for entry in dvc_gi_entries:
        if entry not in gi_lines:
            gi_lines.append(entry)
            added_gi = True
    if added_gi or not existing[".gitignore"]:
        actions.append({
            "action": "update" if existing[".gitignore"] else "create",
            "file_path": ".gitignore",
            "content": "\n".join(gi_lines) + "\n",
        })

    # .dvc/config — MinIO remote so `dvc pull/push` work with CLI
    scheme = "https" if minio_cfg.use_ssl else "http"
    dvc_config_content = (
        "[core]\n"
        "    remote = minio\n\n"
        f"['remote \"minio\"']\n"
        f"    url = s3://{minio_cfg.bucket}\n"
        f"    endpointurl = {scheme}://{minio_cfg.endpoint}\n"
        f"    access_key_id = {minio_cfg.access_key}\n"
    )
    actions.append({
        "action": "update" if existing[".dvc/config"] else "create",
        "file_path": ".dvc/config",
        "content": dvc_config_content,
    })

    # .dvc/.gitignore — keep secret_key + local cache out of git
    dvc_internal_gi = "/tmp\n/cache\n/plots\nconfig.local\n"
    if not existing[".dvc/.gitignore"]:
        actions.append({
            "action": "create",
            "file_path": ".dvc/.gitignore",
            "content": dvc_internal_gi,
        })

    # 9. Commit all files to GitLab in one atomic commit
    msg = commit_message.strip() or f"Add dataset {dataset_name} via DVC"
    try:
        commit = await gitlab_service.commit_files(target, used_branch, msg, actions)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitLab commit failed: {e}")

    return {
        "success": True,
        "repo_path": actual_repo_path,
        "dataset_name": dataset_name,
        "branch": used_branch,
        "dvc_file": dvc_file_path,
        "md5": f"{manifest_md5}.dir",
        "nfiles": len(entries),
        "size": total_size,
        "new_repo_created": new_repo_created,
        "commit_id": commit.get("id", ""),
    }


async def _fetch_existing(
    svc, project, ref: str, paths: list[str]
) -> dict[str, str | None]:
    """Concurrently fetch multiple file contents from GitLab. Returns {path: content | None}."""
    import asyncio
    results = await asyncio.gather(
        *[svc.get_file_content(project, p, ref=ref) for p in paths],
        return_exceptions=True,
    )
    return {
        path: (r if isinstance(r, str) else None)
        for path, r in zip(paths, results)
    }
