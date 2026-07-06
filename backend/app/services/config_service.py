import json
from pathlib import Path
from app.models.config import (
    AppConfig, GitLabProject, GitLabProjectCreate, GitLabProjectUpdate,
    MinIOConfig, MinIOConfigUpdate, GitLabProjectPublic, MinIOConfigPublic,
    SSHConfig, SSHConfigUpdate, SSHConfigPublic, SSHDataset,
    GDriveConfig, GDriveConfigUpdate, GDriveConfigPublic,
    RcloneDataset,
    RedmineConfig, RedmineConfigUpdate, RedmineConfigPublic,
    RedmineStatusMapping,
    ManagedProject,
    User, UserCredentials,
)

CONFIG_FILE = Path("/app/data/config.json")


class ConfigService:
    def load(self) -> AppConfig:
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text())
                return AppConfig(**data)
            except Exception:
                pass
        return AppConfig()

    def _save(self, cfg: AppConfig) -> None:
        CONFIG_FILE.write_text(cfg.model_dump_json(indent=2))

    # --- Projects ---

    def list_projects(self) -> list[GitLabProject]:
        return self.load().projects

    def get_project(self, project_id: str) -> GitLabProject | None:
        return next((p for p in self.load().projects if p.id == project_id), None)

    def add_project(self, data: GitLabProjectCreate) -> GitLabProject:
        cfg = self.load()
        project = GitLabProject(
            name=data.name,
            gitlab_url=data.gitlab_url.rstrip("/"),
            gitlab_token=data.gitlab_token,
            project_path=data.project_path.strip("/"),
            source_type=data.source_type,
            branch=data.branch.strip(),
        )
        cfg.projects.append(project)
        self._save(cfg)
        return project

    def update_project(self, project_id: str, data: GitLabProjectUpdate) -> GitLabProject | None:
        cfg = self.load()
        for i, p in enumerate(cfg.projects):
            if p.id == project_id:
                updates = data.model_dump(exclude_none=True)
                current = p.model_dump()
                if "gitlab_token" in updates and updates["gitlab_token"] == "":
                    del updates["gitlab_token"]  # empty = keep existing
                if "gitlab_url" in updates:
                    updates["gitlab_url"] = updates["gitlab_url"].rstrip("/")
                if "project_path" in updates:
                    updates["project_path"] = updates["project_path"].strip("/")
                current.update(updates)
                cfg.projects[i] = GitLabProject(**current)
                self._save(cfg)
                return cfg.projects[i]
        return None

    def delete_project(self, project_id: str) -> bool:
        cfg = self.load()
        before = len(cfg.projects)
        cfg.projects = [p for p in cfg.projects if p.id != project_id]
        if len(cfg.projects) < before:
            self._save(cfg)
            return True
        return False

    # --- MinIO ---

    def get_minio(self) -> MinIOConfig:
        return self.load().minio

    def update_minio(self, data: MinIOConfigUpdate) -> MinIOConfig:
        cfg = self.load()
        current = cfg.minio.model_dump()
        updates = data.model_dump(exclude_none=True)
        if "secret_key" in updates and updates["secret_key"] == "":
            del updates["secret_key"]
        current.update(updates)
        cfg.minio = MinIOConfig(**current)
        self._save(cfg)
        return cfg.minio

    # --- SSH ---

    def get_ssh(self) -> SSHConfig:
        return self.load().ssh

    def update_ssh(self, data: SSHConfigUpdate) -> SSHConfig:
        cfg = self.load()
        current = cfg.ssh.model_dump()
        updates = data.model_dump(exclude_none=True)
        # empty string = keep existing for secrets
        for key in ("password", "private_key_pem"):
            if key in updates and updates[key] == "":
                del updates[key]
        current.update(updates)
        cfg.ssh = SSHConfig(**current)
        self._save(cfg)
        return cfg.ssh

    # --- SSH Datasets ---

    def list_ssh_datasets(self) -> list[SSHDataset]:
        return self.load().ssh_datasets

    def add_ssh_dataset(self, name: str, path: str) -> SSHDataset:
        cfg = self.load()
        ds = SSHDataset(name=name, path=path)
        cfg.ssh_datasets.append(ds)
        self._save(cfg)
        return ds

    def delete_ssh_dataset(self, dataset_id: str) -> bool:
        cfg = self.load()
        before = len(cfg.ssh_datasets)
        cfg.ssh_datasets = [d for d in cfg.ssh_datasets if d.id != dataset_id]
        if len(cfg.ssh_datasets) < before:
            self._save(cfg)
            return True
        return False

    # --- Google Drive ---

    def get_gdrive(self) -> GDriveConfig:
        return self.load().gdrive

    def update_gdrive(self, data: GDriveConfigUpdate) -> GDriveConfig:
        cfg = self.load()
        current = cfg.gdrive.model_dump()
        updates = data.model_dump(exclude_none=True)
        for key in ("client_secret", "refresh_token"):
            if key in updates and updates[key] == "":
                del updates[key]
        current.update(updates)
        cfg.gdrive = GDriveConfig(**current)
        self._save(cfg)
        return cfg.gdrive

    def set_gdrive_refresh_token(self, refresh_token: str) -> GDriveConfig:
        cfg = self.load()
        cfg.gdrive.refresh_token = refresh_token
        self._save(cfg)
        return cfg.gdrive

    # --- Rclone Datasets ---

    def list_rclone_datasets(self) -> list[RcloneDataset]:
        return self.load().rclone_datasets

    def add_rclone_dataset(self, name: str, remote: str, path: str, provider: str) -> RcloneDataset:
        cfg = self.load()
        ds = RcloneDataset(name=name, remote=remote, path=path, provider=provider)
        cfg.rclone_datasets.append(ds)
        self._save(cfg)
        return ds

    def delete_rclone_dataset(self, dataset_id: str) -> bool:
        cfg = self.load()
        before = len(cfg.rclone_datasets)
        cfg.rclone_datasets = [d for d in cfg.rclone_datasets if d.id != dataset_id]
        if len(cfg.rclone_datasets) < before:
            self._save(cfg)
            return True
        return False

    def disconnect_gdrive(self) -> GDriveConfig:
        cfg = self.load()
        cfg.gdrive.refresh_token = ""
        self._save(cfg)
        return cfg.gdrive

    # --- Public views (secrets masked) ---

    def project_to_public(self, p: GitLabProject) -> GitLabProjectPublic:
        return GitLabProjectPublic(
            id=p.id,
            name=p.name,
            gitlab_url=p.gitlab_url,
            project_path=p.project_path,
            token_set=bool(p.gitlab_token),
            source_type=p.source_type,
            branch=p.branch,
        )

    def minio_to_public(self, m: MinIOConfig) -> MinIOConfigPublic:
        return MinIOConfigPublic(
            endpoint=m.endpoint,
            access_key=m.access_key,
            secret_key_set=bool(m.secret_key),
            bucket=m.bucket,
            use_ssl=m.use_ssl,
        )

    def ssh_to_public(self, s: SSHConfig) -> SSHConfigPublic:
        return SSHConfigPublic(
            host=s.host,
            port=s.port,
            username=s.username,
            password_set=bool(s.password),
            private_key_set=bool(s.private_key_pem),
            remote_path=s.remote_path,
        )

    def gdrive_to_public(self, g: GDriveConfig) -> GDriveConfigPublic:
        return GDriveConfigPublic(
            folder_id=g.folder_id,
            client_id=g.client_id,
            client_secret_set=bool(g.client_secret),
            connected=bool(g.refresh_token),
        )

    # --- Redmine ---

    def get_redmine(self) -> RedmineConfig:
        return self.load().redmine

    def update_redmine(self, data: RedmineConfigUpdate) -> RedmineConfig:
        cfg = self.load()
        current = cfg.redmine.model_dump()
        updates = data.model_dump(exclude_none=True)
        if "api_key" in updates and updates["api_key"] == "":
            del updates["api_key"]
        current.update(updates)
        cfg.redmine = RedmineConfig(**current)
        self._save(cfg)
        return cfg.redmine

    def redmine_to_public(self, r: RedmineConfig) -> RedmineConfigPublic:
        return RedmineConfigPublic(
            url=r.url,
            api_key_set=bool(r.api_key),
            verify_ssl=r.verify_ssl,
        )

    # --- CVAT ---

    def get_cvat(self) -> "CVATConfig":
        from app.models.config import CVATConfig
        return self.load().cvat

    def update_cvat(self, data: "CVATConfigUpdate") -> "CVATConfig":
        from app.models.config import CVATConfig, CVATConfigUpdate
        cfg = self.load()
        current = cfg.cvat.model_dump()
        updates = data.model_dump(exclude_none=True)
        if "password" in updates and updates["password"] == "":
            del updates["password"]
        current.update(updates)
        cfg.cvat = CVATConfig(**current)
        self._save(cfg)
        return cfg.cvat

    def cvat_to_public(self, c: "CVATConfig") -> "CVATConfigPublic":
        from app.models.config import CVATConfigPublic
        return CVATConfigPublic(
            url=c.url,
            username=c.username,
            configured=bool(c.url and c.username and c.password),
            verify_ssl=c.verify_ssl,
        )

    # --- Redmine status mapping ---

    def get_redmine_status_mapping(self) -> RedmineStatusMapping:
        return self.load().redmine_status_mapping

    def save_redmine_status_mapping(self, mapping: dict[str, str]) -> RedmineStatusMapping:
        cfg = self.load()
        cfg.redmine_status_mapping = RedmineStatusMapping(mapping=mapping)
        self._save(cfg)
        return cfg.redmine_status_mapping


    # --- Managed Projects ---

    def list_managed_projects(self) -> list[ManagedProject]:
        return self.load().managed_projects

    def get_managed_project(self, project_id: str) -> ManagedProject | None:
        return next((p for p in self.load().managed_projects if p.id == project_id), None)

    def create_managed_project(self, data: dict) -> ManagedProject:
        cfg = self.load()
        p = ManagedProject(**{k: v for k, v in data.items() if v is not None})
        cfg.managed_projects.append(p)
        self._save(cfg)
        return p

    def update_managed_project(self, project_id: str, data: dict) -> ManagedProject | None:
        cfg = self.load()
        for i, p in enumerate(cfg.managed_projects):
            if p.id == project_id:
                current = p.model_dump()
                current.update({k: v for k, v in data.items() if v is not None})
                cfg.managed_projects[i] = ManagedProject(**current)
                self._save(cfg)
                return cfg.managed_projects[i]
        return None

    def delete_managed_project(self, project_id: str) -> bool:
        cfg = self.load()
        before = len(cfg.managed_projects)
        cfg.managed_projects = [p for p in cfg.managed_projects if p.id != project_id]
        if len(cfg.managed_projects) < before:
            self._save(cfg)
            return True
        return False


    # --- Users ---

    def list_users(self) -> list[User]:
        return self.load().users

    def get_user(self, user_id: str) -> User | None:
        return next((u for u in self.load().users if u.id == user_id), None)

    def get_user_by_username(self, username: str) -> User | None:
        return next((u for u in self.load().users if u.username == username), None)

    def create_user(self, data: dict) -> User:
        cfg = self.load()
        user = User(
            username=data["username"],
            display_name=data.get("display_name", ""),
            password_hash=data.get("password_hash", ""),
            role=data.get("role", "member"),
        )
        cfg.users.append(user)
        self._save(cfg)
        return user

    def update_user(self, user_id: str, data: dict) -> User | None:
        cfg = self.load()
        for i, u in enumerate(cfg.users):
            if u.id == user_id:
                current = u.model_dump()
                # Only allow updating these fields
                allowed = {"display_name", "password_hash", "role", "api_token_hash", "api_token_prefix"}
                for key in allowed:
                    if key in data and data[key] is not None:
                        current[key] = data[key]
                cfg.users[i] = User(**current)
                self._save(cfg)
                return cfg.users[i]
        return None

    def delete_user(self, user_id: str) -> bool:
        cfg = self.load()
        before = len(cfg.users)
        cfg.users = [u for u in cfg.users if u.id != user_id]
        if len(cfg.users) < before:
            self._save(cfg)
            return True
        return False

    def update_user_credentials(
        self, user_id: str, gitlab_token: str | None, redmine_api_key: str | None
    ) -> User | None:
        cfg = self.load()
        for i, u in enumerate(cfg.users):
            if u.id == user_id:
                current = u.model_dump()
                creds = current.get("credentials", {})
                if gitlab_token is not None:
                    creds["gitlab_token"] = gitlab_token
                if redmine_api_key is not None:
                    creds["redmine_api_key"] = redmine_api_key
                current["credentials"] = creds
                cfg.users[i] = User(**current)
                self._save(cfg)
                return cfg.users[i]
        return None

    def set_user_api_token(self, user_id: str, token_hash: str, token_prefix: str) -> User | None:
        return self.update_user(user_id, {"api_token_hash": token_hash, "api_token_prefix": token_prefix})

    def revoke_user_api_token(self, user_id: str) -> bool:
        return self.update_user(user_id, {"api_token_hash": "", "api_token_prefix": ""}) is not None


config_service = ConfigService()
