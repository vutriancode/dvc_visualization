from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        request.state.user = None
        request.state.user_token = token
        if token:
            from app.services.auth_service import auth_service, verify_pat
            user = auth_service.get_current_user(token)   # session token
            if not user:
                user = verify_pat(token)                   # personal access token
            request.state.user = user
        return await call_next(request)
