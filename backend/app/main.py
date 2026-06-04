from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import datasets_router, config_router, projects_router

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

app.include_router(config_router)
app.include_router(projects_router)
app.include_router(datasets_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "dvc-dashboard"}
