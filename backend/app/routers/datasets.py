from fastapi import APIRouter, HTTPException, Query
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
