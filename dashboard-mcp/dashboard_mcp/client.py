"""HTTP client for the DVC Data Management Dashboard API."""
import os

import httpx

from .context import user_token_var

BASE_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3004/api").rstrip("/")


def get(path: str, params: dict = None) -> dict:
    """Perform a GET request against the dashboard API, forwarding the user token."""
    url = f"{BASE_URL}/{path.lstrip('/')}"
    token = user_token_var.get()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json()
        except Exception:
            detail = exc.response.text
        raise httpx.HTTPStatusError(
            f"Dashboard API error {exc.response.status_code} for {url}: {detail}",
            request=exc.request,
            response=exc.response,
        ) from exc
