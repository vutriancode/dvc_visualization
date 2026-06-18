from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.services.auth_service import hash_password
from app.services.config_service import config_service

router = APIRouter(prefix="/api/users", tags=["users"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _require_auth(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _require_admin(request: Request):
    user = _require_auth(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    username: str
    display_name: str
    role: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    role: str = "member"


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None  # new password (optional)


class CredentialsStatusOut(BaseModel):
    gitlab_token_set: bool
    redmine_api_key_set: bool


class UpdateCredentialsRequest(BaseModel):
    gitlab_token: Optional[str] = None
    redmine_api_key: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[UserOut])
def list_users(request: Request):
    _require_admin(request)
    return [
        UserOut(id=u.id, username=u.username, display_name=u.display_name, role=u.role)
        for u in config_service.list_users()
    ]


@router.post("/", response_model=UserOut, status_code=201)
def create_user(payload: CreateUserRequest, request: Request):
    _require_admin(request)
    existing = config_service.get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{payload.username}' already exists")
    user = config_service.create_user({
        "username": payload.username,
        "password_hash": hash_password(payload.password),
        "display_name": payload.display_name,
        "role": payload.role,
    })
    return UserOut(id=user.id, username=user.username, display_name=user.display_name, role=user.role)


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: UpdateUserRequest, request: Request):
    _require_admin(request)
    data: dict = {}
    if payload.display_name is not None:
        data["display_name"] = payload.display_name
    if payload.role is not None:
        data["role"] = payload.role
    if payload.password is not None and payload.password != "":
        data["password_hash"] = hash_password(payload.password)
    user = config_service.update_user(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut(id=user.id, username=user.username, display_name=user.display_name, role=user.role)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, request: Request):
    current = _require_admin(request)
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if not config_service.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")


@router.get("/me/credentials", response_model=CredentialsStatusOut)
def get_my_credentials(request: Request):
    user = _require_auth(request)
    return CredentialsStatusOut(
        gitlab_token_set=bool(user.credentials.gitlab_token),
        redmine_api_key_set=bool(user.credentials.redmine_api_key),
    )


@router.put("/me/credentials", response_model=CredentialsStatusOut)
def update_my_credentials(payload: UpdateCredentialsRequest, request: Request):
    user = _require_auth(request)
    updated = config_service.update_user_credentials(
        user.id,
        gitlab_token=payload.gitlab_token,
        redmine_api_key=payload.redmine_api_key,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return CredentialsStatusOut(
        gitlab_token_set=bool(updated.credentials.gitlab_token),
        redmine_api_key_set=bool(updated.credentials.redmine_api_key),
    )
