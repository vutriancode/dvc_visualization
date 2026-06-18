"""HTTP client for the DVC Data Management Dashboard API."""
import os

import httpx

BASE_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3004/api").rstrip("/")


def get(path: str, params: dict = None) -> dict:
    """Perform a GET request against the dashboard API.

    Args:
        path: API path relative to BASE_URL (e.g. '/managed-projects').
        params: Optional query-string parameters dict.

    Returns:
        Parsed JSON response body (dict or list).

    Raises:
        httpx.HTTPStatusError: Re-raised with a human-readable message on 4xx/5xx.
        httpx.RequestError: On network-level failures.
    """
    url = f"{BASE_URL}/{path.lstrip('/')}"
    try:
        response = httpx.get(url, params=params, timeout=30)
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
