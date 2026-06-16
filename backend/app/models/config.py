from pydantic import BaseModel, Field
from typing import Optional, Literal
import uuid


class GitLabProject(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    gitlab_url: str
    gitlab_token: str
    project_path: str  # namespace/project, numeric ID, or group/subgroup path
    source_type: Literal["project", "group"] = "project"
    branch: str = ""  # empty = use HEAD (repo default)


class GitLabProjectPublic(BaseModel):
    """Returned to frontend — token masked."""
    id: str
    name: str
    gitlab_url: str
    project_path: str
    token_set: bool
    source_type: Literal["project", "group"] = "project"
    branch: str = ""


class GitLabProjectCreate(BaseModel):
    name: str
    gitlab_url: str
    gitlab_token: str
    project_path: str
    source_type: Literal["project", "group"] = "project"
    branch: str = ""


class GitLabProjectUpdate(BaseModel):
    name: Optional[str] = None
    gitlab_url: Optional[str] = None
    gitlab_token: Optional[str] = None  # empty = keep existing
    project_path: Optional[str] = None
    source_type: Optional[Literal["project", "group"]] = None
    branch: Optional[str] = None


class MinIOConfig(BaseModel):
    endpoint: str = ""
    access_key: str = ""
    secret_key: str = ""
    bucket: str = "dvc"
    use_ssl: bool = False


class MinIOConfigPublic(BaseModel):
    endpoint: str
    access_key: str
    secret_key_set: bool
    bucket: str
    use_ssl: bool


class MinIOConfigUpdate(BaseModel):
    endpoint: Optional[str] = None
    access_key: Optional[str] = None
    secret_key: Optional[str] = None  # empty = keep existing
    bucket: Optional[str] = None
    use_ssl: Optional[bool] = None


class SSHConfig(BaseModel):
    host: str = ""
    port: int = 22
    username: str = ""
    password: str = ""
    private_key_pem: str = ""  # PEM content for key-based auth
    remote_path: str = ""      # base path on server, e.g. /data/dvc-storage


class SSHConfigPublic(BaseModel):
    host: str
    port: int
    username: str
    password_set: bool
    private_key_set: bool
    remote_path: str


class SSHConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None        # empty = keep existing
    private_key_pem: Optional[str] = None  # empty = keep existing
    remote_path: Optional[str] = None


class GDriveConfig(BaseModel):
    folder_id: str = ""
    client_id: str = ""
    client_secret: str = ""
    refresh_token: str = ""  # set after OAuth flow completes


class GDriveConfigPublic(BaseModel):
    folder_id: str
    client_id: str
    client_secret_set: bool
    connected: bool  # True when refresh_token is set


class GDriveConfigUpdate(BaseModel):
    folder_id: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None   # empty = keep existing
    refresh_token: Optional[str] = None   # empty = keep existing


class SSHDataset(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    path: str  # full path on SSH server


class RcloneDataset(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    remote: str   # rclone remote name (e.g. "gdrive")
    path: str     # path within the remote (e.g. "datasets/my-data")
    provider: str  # "drive", "dropbox", etc. — for display/icons


class AppConfig(BaseModel):
    projects: list[GitLabProject] = []
    minio: MinIOConfig = Field(default_factory=MinIOConfig)
    ssh: SSHConfig = Field(default_factory=SSHConfig)
    ssh_datasets: list[SSHDataset] = []
    gdrive: GDriveConfig = Field(default_factory=GDriveConfig)
    rclone_datasets: list[RcloneDataset] = []
