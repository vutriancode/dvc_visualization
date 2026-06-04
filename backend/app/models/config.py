from pydantic import BaseModel, Field
from typing import Optional
import uuid


class GitLabProject(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    gitlab_url: str
    gitlab_token: str
    project_path: str  # namespace/project or numeric ID


class GitLabProjectPublic(BaseModel):
    """Returned to frontend — token masked."""
    id: str
    name: str
    gitlab_url: str
    project_path: str
    token_set: bool


class GitLabProjectCreate(BaseModel):
    name: str
    gitlab_url: str
    gitlab_token: str
    project_path: str


class GitLabProjectUpdate(BaseModel):
    name: Optional[str] = None
    gitlab_url: Optional[str] = None
    gitlab_token: Optional[str] = None  # empty = keep existing
    project_path: Optional[str] = None


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


class AppConfig(BaseModel):
    projects: list[GitLabProject] = []
    minio: MinIOConfig = Field(default_factory=MinIOConfig)
