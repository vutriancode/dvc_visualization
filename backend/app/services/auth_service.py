"""Authentication service — password hashing and in-memory session management."""
import hashlib
import hmac
import os
import secrets
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.config import User

# ── Personal Access Tokens ────────────────────────────────────────────────────

def generate_pat(user_id: str) -> str:
    """Generate a new Personal Access Token, persist its SHA-256 hash, return plain token (shown once)."""
    from app.services.config_service import config_service
    token = "pat_" + secrets.token_urlsafe(32)
    h = hashlib.sha256(token.encode()).hexdigest()
    prefix = token[:12]  # "pat_" + first 8 chars
    config_service.set_user_api_token(user_id, h, prefix)
    return token


def verify_pat(token: str) -> "User | None":
    """Return the User whose PAT matches this token, or None."""
    from app.services.config_service import config_service
    if not isinstance(token, str) or not token.startswith("pat_"):
        return None
    h = hashlib.sha256(token.encode()).hexdigest()
    for user in config_service.list_users():
        if user.api_token_hash and hmac.compare_digest(user.api_token_hash, h):
            return user
    return None


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256.
    Returns a string in the form 'pbkdf2:sha256:{salt_hex}:{hash_hex}'.
    """
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260_000)
    return f"pbkdf2:sha256:{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a stored hash produced by hash_password()."""
    try:
        parts = stored.split(":")
        if len(parts) != 4 or parts[0] != "pbkdf2" or parts[1] != "sha256":
            return False
        _, _, salt_hex, stored_hash_hex = parts
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260_000)
        return hmac.compare_digest(dk.hex(), stored_hash_hex)
    except Exception:
        return False


# In-memory session store: token -> user_id
_sessions: dict[str, str] = {}


def create_session(user_id: str) -> str:
    """Create a new session token for the given user_id and return it."""
    token = secrets.token_urlsafe(32)
    _sessions[token] = user_id
    return token


def revoke_session(token: str) -> None:
    """Remove a session token."""
    _sessions.pop(token, None)


def get_user_id_from_token(token: str) -> str | None:
    """Return the user_id associated with the given token, or None."""
    return _sessions.get(token)


class AuthService:
    def get_current_user(self, token: str) -> "User | None":
        """Given a session token, return the corresponding User or None."""
        from app.services.config_service import config_service
        user_id = get_user_id_from_token(token)
        if not user_id:
            return None
        return config_service.get_user(user_id)


auth_service = AuthService()
