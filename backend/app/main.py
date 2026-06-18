from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.config import settings
from app.routers import datasets_router, config_router, projects_router, storage_router, rclone_router, redmine_router

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

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    import logging
    body = await request.body()
    logging.error(f"422 Validation error on {request.method} {request.url}\nBody: {body.decode()}\nErrors: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

app.include_router(config_router)
app.include_router(projects_router)
app.include_router(datasets_router)
app.include_router(storage_router)
app.include_router(rclone_router)
app.include_router(redmine_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "dvc-dashboard"}
