from pydantic import BaseModel
from typing import Optional, Literal


class DvcFileMeta(BaseModel):
    md5: Optional[str] = None
    size: Optional[int] = None
    path: str
    nfiles: Optional[int] = None  # present when tracking a directory


class DatasetVersion(BaseModel):
    commit_id: str
    commit_short: str
    message: str
    author: str
    authored_date: str
    dvc_path: str
    md5: Optional[str] = None
    size: Optional[int] = None


class Dataset(BaseModel):
    id: str
    name: str
    dvc_file: str
    path: str
    md5: Optional[str] = None
    size: Optional[int] = None
    nfiles: Optional[int] = None
    last_modified: Optional[str] = None
    last_commit_message: Optional[str] = None
    last_author: Optional[str] = None
    version_count: int = 0
    project_id: str = ""
    project_name: str = ""
    gitlab_url: str = ""
    repo_path: str = ""  # namespace/project of the actual git repo
    source_type: Literal["dvc", "ssh", "rclone"] = "dvc"
    rclone_remote: str = ""    # rclone remote name, set when source_type=="rclone"
    provider: str = ""         # rclone provider type for icons


class DatasetDetail(Dataset):
    versions: list[DatasetVersion] = []


class MinioObject(BaseModel):
    name: str
    size: int
    last_modified: str
    etag: Optional[str] = None


class StatsResponse(BaseModel):
    total_datasets: int
    total_size_bytes: int
    total_projects: int
    minio_bucket: str
