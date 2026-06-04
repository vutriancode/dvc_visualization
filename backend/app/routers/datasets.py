from fastapi import APIRouter, HTTPException, Query
from app.services.gitlab_service import gitlab_service
from app.services.minio_service import minio_service
from app.services.config_service import config_service
from app.models import Dataset, DatasetDetail, MinioObject, StatsResponse

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


async def _get_datasets(project_id: str | None, search: str) -> list[Dataset]:
    """Fetch datasets from one project or all projects."""
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
            datasets = await gitlab_service.list_dvc_files(project)
            all_datasets.extend(datasets)
        except Exception:
            continue  # skip failed projects, don't break the whole response

    if search:
        all_datasets = [d for d in all_datasets if search.lower() in d.name.lower()]

    return all_datasets


@router.get("", response_model=list[Dataset])
async def list_datasets(
    project_id: str = Query(default="all", description="Project ID or 'all'"),
    search: str = Query(default=""),
):
    try:
        return await _get_datasets(project_id, search)
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
