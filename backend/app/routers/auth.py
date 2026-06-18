from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.auth_service import auth_service, verify_password, create_session, revoke_session
from app.services.config_service import config_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str
    role: str


class LoginResponse(BaseModel):
    token: str
    user: UserPublic


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = config_service.get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_session(user.id)
    return LoginResponse(
        token=token,
        user=UserPublic(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            role=user.role,
        ),
    )


@router.post("/logout")
def logout(request: Request):
    token = getattr(request.state, "user_token", None)
    if token:
        revoke_session(token)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
def me(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserPublic(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
    )
