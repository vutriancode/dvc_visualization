# Dashboard MCP

An MCP server that wraps the DVC Data Management Dashboard FastAPI backend, giving Claude (or any MCP-compatible AI client) direct access to managed projects, DVC datasets, and Redmine task data.

## Prerequisites

- Python 3.10+
- The dashboard backend must be running at `http://localhost:3004` (or override via `DASHBOARD_URL`)

## Installation

### Using pip

```bash
cd dashboard-mcp
pip install -e .
```

### Using uv (recommended)

```bash
cd dashboard-mcp
uv pip install -e .
```

## Claude Desktop Integration

### Config file location

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Add to `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dashboard": {
      "command": "dashboard-mcp",
      "env": {
        "DASHBOARD_URL": "http://localhost:3004/api"
      }
    }
  }
}
```

If you installed with `uv` into a virtual environment, use the full path to the script:

```json
{
  "mcpServers": {
    "dashboard": {
      "command": "/path/to/venv/bin/dashboard-mcp",
      "env": {
        "DASHBOARD_URL": "http://localhost:3004/api"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_managed_projects` | List all projects with id, name, status, tags, links |
| `get_managed_project_summary` | Dataset count, open/total tasks, member count for a project |
| `list_datasets` | DVC datasets for a project, with optional search filter |
| `list_redmine_issues` | Redmine tasks filtered by status and limit |
| `get_redmine_stats` | Per-member task stats and burndown data |
| `get_redmine_hours` | Actual vs estimated hours per member |
| `get_redmine_members` | Team members and roles in a project's Redmine project |
| `get_project_context` | Full Markdown project summary (great as AI context) |

## Running in SSE mode (optional)

```bash
dashboard-mcp --transport sse --host 0.0.0.0 --port 8000
```

## Notes

- The dashboard backend must be running at `localhost:3004` (or the URL set in `DASHBOARD_URL`) before Claude can use any of these tools.
- All tools are read-only; no mutations are performed against the backend.
