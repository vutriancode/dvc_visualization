from pydantic import BaseModel, Field
from typing import Optional, Literal
import uuid


class UserCredentials(BaseModel):
    gitlab_token: str = ""      # personal GitLab token (overrides global)
    redmine_api_key: str = ""   # personal Redmine API key (overrides global)


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    display_name: str = ""
    password_hash: str = ""
    role: Literal["admin", "member"] = "member"
    credentials: UserCredentials = Field(default_factory=UserCredentials)


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


class RedmineConfig(BaseModel):
    url: str = ""
    api_key: str = ""
    verify_ssl: bool = True


class RedmineConfigPublic(BaseModel):
    url: str
    api_key_set: bool
    verify_ssl: bool


class RedmineConfigUpdate(BaseModel):
    url: Optional[str] = None
    api_key: Optional[str] = None   # empty string = keep existing
    verify_ssl: Optional[bool] = None


class RedmineStatusMapping(BaseModel):
    """Maps Redmine status IDs (as strings) to one of: todo | in_progress | done."""
    mapping: dict[str, str] = {}  # {"1": "todo", "2": "in_progress", "3": "done", ...}


class ManagedProject(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: Literal["active", "planning", "completed", "paused"] = "active"
    start_date: str = ""
    end_date: str = ""
    tags: list[str] = []
    color: str = "#3b82f6"
    gitlab_config_id: str = ""        # GitLabProject.id (from config)
    ssh_dataset_ids: list[str] = []   # SSHDataset.id list
    rclone_dataset_ids: list[str] = [] # RcloneDataset.id list
    redmine_project_id: str = ""      # Redmine project identifier


class AppConfig(BaseModel):
    managed_projects: list[ManagedProject] = []
    projects: list[GitLabProject] = []
    minio: MinIOConfig = Field(default_factory=MinIOConfig)
    ssh: SSHConfig = Field(default_factory=SSHConfig)
    ssh_datasets: list[SSHDataset] = []
    gdrive: GDriveConfig = Field(default_factory=GDriveConfig)
    rclone_datasets: list[RcloneDataset] = []
    redmine: RedmineConfig = Field(default_factory=RedmineConfig)
    redmine_status_mapping: RedmineStatusMapping = Field(default_factory=RedmineStatusMapping)
    users: list[User] = []
