import json
from pathlib import Path
from app.models.config import (
    AppConfig, GitLabProject, GitLabProjectCreate, GitLabProjectUpdate,
    MinIOConfig, MinIOConfigUpdate, GitLabProjectPublic, MinIOConfigPublic,
)

CONFIG_FILE = Path(__file__).parent.parent.parent / "config.json"


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
            project_path=data.project_path,
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

    # --- Public views (secrets masked) ---

    def project_to_public(self, p: GitLabProject) -> GitLabProjectPublic:
        return GitLabProjectPublic(
            id=p.id,
            name=p.name,
            gitlab_url=p.gitlab_url,
            project_path=p.project_path,
            token_set=bool(p.gitlab_token),
        )

    def minio_to_public(self, m: MinIOConfig) -> MinIOConfigPublic:
        return MinIOConfigPublic(
            endpoint=m.endpoint,
            access_key=m.access_key,
            secret_key_set=bool(m.secret_key),
            bucket=m.bucket,
            use_ssl=m.use_ssl,
        )


config_service = ConfigService()
