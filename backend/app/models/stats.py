from pydantic import BaseModel
from typing import Optional


class DatasetStat(BaseModel):
    name: str
    dvc_file: str
    path: str
    size: Optional[int] = None
    nfiles: Optional[int] = None
    version_count: int = 0
    last_modified: Optional[str] = None
    last_author: Optional[str] = None
    last_commit_message: Optional[str] = None
    md5: Optional[str] = None


class ProjectStats(BaseModel):
    project_id: str
    project_name: str
    gitlab_url: str
    project_path: str
    total_datasets: int
    total_size_bytes: int
    total_versions: int
    total_files: int
    datasets: list[DatasetStat]
