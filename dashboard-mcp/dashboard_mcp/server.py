"""FastMCP server for the DVC Data Management Dashboard."""
import json

from mcp.server.fastmcp import FastMCP

from .client import get

mcp = FastMCP("Dashboard MCP")


# ── Managed Projects ──────────────────────────────────────────────────────────

@mcp.tool()
def list_managed_projects() -> str:
    """List all managed projects registered in the dashboard.

    Returns a JSON array of project objects, each containing:
    - id: internal numeric ID
    - name: human-readable project name
    - status: current project status (e.g. 'active', 'archived')
    - tags: list of tag strings associated with the project
    - links: related URLs (GitLab repo, Redmine project, etc.)

    Use this tool first to discover available project IDs before calling
    other tools that require a project_id.
    """
    return json.dumps(get("/managed-projects"), ensure_ascii=False, indent=2)


@mcp.tool()
def get_managed_project_summary(project_id: str) -> str:
    """Get a high-level numeric summary for a single managed project.

    Returns a JSON object with:
    - dataset_count: number of DVC datasets linked to the project
    - open_task_count: number of currently open Redmine tasks
    - total_task_count: total Redmine tasks ever created
    - member_count: number of team members

    Args:
        project_id: The numeric or string ID of the managed project
                    (obtain from list_managed_projects).
    """
    return json.dumps(get(f"/managed-projects/{project_id}/summary"), ensure_ascii=False, indent=2)


# ── Datasets ──────────────────────────────────────────────────────────────────

@mcp.tool()
def list_datasets(project_id: str, search: str = "") -> str:
    """List DVC datasets associated with a managed project.

    Returns a JSON array of dataset objects. Each entry typically includes
    the dataset name, DVC remote path, version info, and last-updated
    timestamp.

    Args:
        project_id: The GitLab config ID for the project whose datasets
                    should be listed (corresponds to the gitlab_config_id
                    stored in the dashboard).
        search: Optional free-text filter applied server-side to dataset
                names. Leave empty to return all datasets.
    """
    params: dict = {"project_id": project_id}
    if search:
        params["search"] = search
    return json.dumps(get("/datasets", params=params), ensure_ascii=False, indent=2)


# ── Redmine ───────────────────────────────────────────────────────────────────

@mcp.tool()
def list_redmine_issues(
    project_id: str,
    status_id: str = "open",
    limit: int = 25,
) -> str:
    """List Redmine issues (tasks) for a managed project.

    Returns a JSON array of issue objects including id, subject, status,
    assignee, priority, and dates.

    Args:
        project_id: The managed project ID whose Redmine project should
                    be queried (the dashboard resolves the Redmine project
                    identifier internally).
        status_id: Filter by status. Use 'open' (default), 'closed', or '*'
                   for all issues. Numeric status IDs are also accepted.
        limit: Maximum number of issues to return (default 25).
    """
    params: dict = {
        "project_id": project_id,
        "status_id": status_id,
        "limit": limit,
    }
    return json.dumps(get("/redmine/issues", params=params), ensure_ascii=False, indent=2)


@mcp.tool()
def get_redmine_stats(
    project_id: str,
    from_date: str = "",
    to_date: str = "",
) -> str:
    """Get Redmine task statistics for a managed project.

    Returns a JSON object containing:
    - member_stats: per-member breakdown of open, closed, and total tasks
    - burndown: time-series data showing remaining vs completed tasks,
      suitable for rendering a burndown chart

    Args:
        project_id: The managed project ID to query.
        from_date: Start of the date range in YYYY-MM-DD format (inclusive).
                   Leave empty to use the project start date.
        to_date: End of the date range in YYYY-MM-DD format (inclusive).
                 Leave empty to use today's date.
    """
    params: dict = {"project_id": project_id}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date
    return json.dumps(get("/redmine/stats", params=params), ensure_ascii=False, indent=2)


@mcp.tool()
def get_redmine_hours(
    project_id: str,
    from_date: str = "",
    to_date: str = "",
) -> str:
    """Get actual vs estimated hours logged in Redmine per team member.

    Returns a JSON object with per-member time-tracking data so you can
    see who is over/under their estimated effort.

    Fields typically include:
    - member: name or username
    - estimated_hours: sum of estimated hours across assigned tasks
    - actual_hours: sum of hours actually logged via time entries

    Args:
        project_id: The managed project ID to query.
        from_date: Start of the date range in YYYY-MM-DD format (inclusive).
                   Leave empty to include all time entries.
        to_date: End of the date range in YYYY-MM-DD format (inclusive).
                 Leave empty to use today's date.
    """
    params: dict = {"project_id": project_id}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date
    return json.dumps(get("/redmine/hours", params=params), ensure_ascii=False, indent=2)


@mcp.tool()
def get_redmine_members(project_id: str) -> str:
    """Get the list of members for a managed project's Redmine project.

    Returns a JSON array of member objects, each containing the user's
    name, login, and assigned roles within the Redmine project.

    Args:
        project_id: The managed project ID whose Redmine membership should
                    be retrieved.
    """
    return json.dumps(get(f"/redmine/projects/{project_id}/members"), ensure_ascii=False, indent=2)


# ── Context ───────────────────────────────────────────────────────────────────

@mcp.tool()
def get_project_context(project_id: str) -> str:
    """Get a full markdown summary of a managed project, ready to paste into any AI chat.

    This endpoint aggregates project metadata, dataset list, open task
    summary, member list, and recent activity into a single Markdown
    document. It is the fastest way to give an AI assistant full context
    about a project without calling multiple tools.

    Use this tool when the user asks for an overview, a status report, or
    wants to start a conversation about a specific project.

    Args:
        project_id: The managed project ID to summarise.
    """
    return json.dumps(get("/context", params={"project_id": project_id}), ensure_ascii=False, indent=2)


# ── Entry point ───────────────────────────────────────────────────────────────

def _make_token_middleware(app):
    """Pure-ASGI middleware: extracts user token from ?token= or Authorization header.

    Works with SSE (streaming) because it never buffers the response body.
    Python's asyncio inherits ContextVar values into child tasks created from
    the current context, so the value set here is visible in all tool calls.
    """
    from urllib.parse import parse_qs
    from .context import user_token_var

    async def middleware(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            qs = scope.get("query_string", b"").decode()
            params = parse_qs(qs)
            token = params.get("token", [""])[0]
            if not token:
                for k, v in scope.get("headers", []):
                    if k.lower() == b"authorization":
                        auth = v.decode()
                        if auth.lower().startswith("bearer "):
                            token = auth[7:]
                        break
            ctx = user_token_var.set(token)
            try:
                await app(scope, receive, send)
            finally:
                user_token_var.reset(ctx)
        else:
            await app(scope, receive, send)

    return middleware


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Dashboard FastMCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="Transport protocol (default: stdio)",
    )
    parser.add_argument("--host", default="0.0.0.0", help="SSE bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="SSE bind port (default: 8000)")
    args = parser.parse_args()

    if args.transport == "sse":
        import uvicorn as _uvicorn

        mcp.settings.host = args.host
        mcp.settings.port = args.port

        # Monkey-patch uvicorn.run to wrap the FastMCP SSE app with our token middleware.
        # FastMCP calls uvicorn.run(starlette_app, ...) internally — we intercept it here.
        _orig_run = _uvicorn.run

        def _patched_run(app, **kwargs):
            _orig_run(_make_token_middleware(app), **kwargs)

        _uvicorn.run = _patched_run

    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()
