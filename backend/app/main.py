from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.config import settings
from app.middleware import AuthMiddleware
from app.routers import (
    datasets_router, config_router, projects_router, storage_router,
    rclone_router, redmine_router, managed_projects_router, context_router,
    auth_router, users_router,
)

app = FastAPI(
    title="DVC Data Management Dashboard",
    description="API for managing DVC datasets stored on GitLab + MinIO",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    import logging
    body = await request.body()
    logging.error(f"422 Validation error on {request.method} {request.url}\nBody: {body.decode()}\nErrors: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(config_router)
app.include_router(projects_router)
app.include_router(datasets_router)
app.include_router(storage_router)
app.include_router(rclone_router)
app.include_router(redmine_router)
app.include_router(managed_projects_router)
app.include_router(context_router)


@app.on_event("startup")
def bootstrap_admin():
    """Create a default admin user if no users exist yet."""
    from app.services.config_service import config_service
    from app.services.auth_service import hash_password
    if not config_service.list_users():
        config_service.create_user({
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "display_name": "Administrator",
            "role": "admin",
        })


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "dvc-dashboard"}
