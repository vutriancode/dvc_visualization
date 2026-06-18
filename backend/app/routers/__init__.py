from .datasets import router as datasets_router
from .config import router as config_router
from .projects import router as projects_router
from .storage import router as storage_router
from .rclone import router as rclone_router
from .redmine import router as redmine_router
from .managed_projects import router as managed_projects_router

__all__ = ["datasets_router", "config_router", "projects_router", "storage_router", "rclone_router", "redmine_router", "managed_projects_router"]
