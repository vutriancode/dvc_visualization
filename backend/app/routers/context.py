"""
GET /api/context?project_id=<managed_project_id>
Returns a rich markdown summary of a project suitable for pasting into Claude/ChatGPT.
"""
import asyncio
from fastapi import APIRouter, Query
from app.services.config_service import config_service

router = APIRouter(prefix="/api/context", tags=["context"])


@router.get("")
async def get_context(project_id: str = Query(..., description="Managed project ID")):
    p = config_service.get_managed_project(project_id)
    if not p:
        # Return a generic dashboard context if no project specified
        projects = config_service.list_managed_projects()
        lines = [
            "# DVC Data Management Dashboard — Tổng quan\n",
            f"Có {len(projects)} dự án đang quản lý:\n",
        ]
        for proj in projects:
            lines.append(f"- **{proj.name}** ({proj.status}): {proj.description or 'Không có mô tả'}")
        return {"markdown": "\n".join(lines)}

    lines = []

    # ── Project info ──────────────────────────────────────────────────────────
    lines.append(f"# Dự án: {p.name}\n")
    if p.description:
        lines.append(f"{p.description}\n")
    lines.append(f"- **Trạng thái**: {p.status}")
    if p.start_date:
        lines.append(f"- **Bắt đầu**: {p.start_date}")
    if p.end_date:
        lines.append(f"- **Kết thúc**: {p.end_date}")
    if p.tags:
        lines.append(f"- **Tags**: {', '.join(p.tags)}")
    lines.append("")

    # ── Fetch data concurrently ───────────────────────────────────────────────
    async def fetch_datasets():
        if not p.gitlab_config_id:
            return []
        try:
            from app.services.gitlab_service import gitlab_service
            gl = config_service.get_project(p.gitlab_config_id)
            if not gl:
                return []
            return await gitlab_service.list_dvc_files(gl)
        except Exception:
            return []

    async def fetch_issues():
        if not p.redmine_project_id:
            return [], 0
        try:
            from app.services.redmine_service import redmine_service
            issues, total = await redmine_service.list_issues(
                project_id=p.redmine_project_id,
                status_id="open",
                limit=20,
            )
            return issues, total
        except Exception:
            return [], 0

    async def fetch_all_issues_count():
        if not p.redmine_project_id:
            return 0
        try:
            from app.services.redmine_service import redmine_service
            _, total = await redmine_service.list_issues(
                project_id=p.redmine_project_id,
                status_id="*",
                limit=1,
            )
            return total
        except Exception:
            return 0

    async def fetch_members():
        if not p.redmine_project_id:
            return []
        try:
            from app.services.redmine_service import redmine_service
            return await redmine_service.list_members(p.redmine_project_id)
        except Exception:
            return []

    dvc_files, (open_issues, open_total), all_count, members = await asyncio.gather(
        fetch_datasets(),
        fetch_issues(),
        fetch_all_issues_count(),
        fetch_members(),
    )

    # ── Datasets ──────────────────────────────────────────────────────────────
    all_ssh = config_service.list_ssh_datasets()
    all_rclone = config_service.list_rclone_datasets()
    ssh_datasets = [d for d in all_ssh if d.id in p.ssh_dataset_ids]
    rclone_datasets = [d for d in all_rclone if d.id in p.rclone_dataset_ids]

    total_datasets = len(dvc_files) + len(ssh_datasets) + len(rclone_datasets)
    lines.append(f"## Datasets ({total_datasets} tổng)\n")

    if dvc_files:
        lines.append(f"**GitLab/DVC** ({len(dvc_files)} datasets):")
        for f in dvc_files[:10]:
            size_str = f" ({f.size // 1_048_576} MB)" if f.size else ""
            lines.append(f"  - `{f.name}`{size_str}")
        if len(dvc_files) > 10:
            lines.append(f"  - ... và {len(dvc_files) - 10} dataset khác")
    if ssh_datasets:
        lines.append(f"\n**SSH** ({len(ssh_datasets)} datasets):")
        for d in ssh_datasets:
            lines.append(f"  - `{d.name}` → `{d.path}`")
    if rclone_datasets:
        lines.append(f"\n**Cloud/Rclone** ({len(rclone_datasets)} datasets):")
        for d in rclone_datasets:
            lines.append(f"  - `{d.name}` ({d.provider}) → `{d.remote}:{d.path}`")
    if total_datasets == 0:
        lines.append("Chưa có dataset nào được liên kết.")
    lines.append("")

    # ── Tasks / Redmine ───────────────────────────────────────────────────────
    if p.redmine_project_id:
        lines.append(f"## Tasks Redmine (project: `{p.redmine_project_id}`)\n")
        lines.append(f"- **Đang mở**: {open_total}")
        lines.append(f"- **Tổng cộng**: {all_count}")
        if members:
            lines.append(f"- **Thành viên**: {len(members)} người ({', '.join(m.get('name', '') for m in members[:8])})")
        lines.append("")

        if open_issues:
            lines.append(f"### {min(len(open_issues), open_total)} tasks đang mở gần nhất:\n")
            for issue in open_issues[:15]:
                assignee = issue.get("assigned_to", {}).get("name", "chưa giao")
                priority = issue.get("priority", {}).get("name", "Normal")
                tracker = issue.get("tracker", {}).get("name", "")
                lines.append(
                    f"- **#{issue['id']}** [{tracker}] {issue['subject']} "
                    f"— {assignee} ({priority})"
                )
            if open_total > len(open_issues):
                lines.append(f"\n_... và {open_total - len(open_issues)} tasks mở khác_")
        lines.append("")
    else:
        lines.append("## Tasks\nChưa liên kết dự án Redmine.\n")

    # ── MCP Servers ───────────────────────────────────────────────────────────
    redmine_cfg = config_service.get_redmine()

    lines.append("## MCP Servers sẵn sàng tích hợp\n")
    lines.append(
        "Các MCP server đang chạy dưới dạng **SSE service** — "
        "Claude Desktop kết nối trực tiếp qua URL, không cần cài thêm gì.\n"
    )

    # Dashboard MCP
    lines.append("### 1. Dashboard MCP")
    lines.append("- **SSE URL**: `http://localhost:3005/sse`")
    lines.append("- **Tools**: `list_managed_projects`, `get_managed_project_summary`,")
    if p.gitlab_config_id:
        lines.append(f"  `list_datasets` ({len(dvc_files)} datasets),")
    if p.redmine_project_id:
        lines.append(
            f"  `list_redmine_issues` (project `{p.redmine_project_id}`), "
            "`get_redmine_stats`, `get_redmine_hours`, `get_redmine_members`,"
        )
    lines.append(f"  `get_project_context` (dự án `{p.id}`)")
    lines.append("")
    lines.append("```json")
    lines.append('{ "mcpServers": { "dashboard": { "url": "http://localhost:3005/sse" } } }')
    lines.append("```\n")

    # Redmine MCP
    if redmine_cfg.url:
        lines.append("### 2. Redmine MCP")
        lines.append("- **SSE URL**: `http://localhost:3006/sse`")
        lines.append(f"- **Redmine**: `{redmine_cfg.url}`")
        lines.append("- **Tools**: `list_issues`, `create_issue`, `update_issue`, `delete_issue`,")
        lines.append("  `list_time_entries`, `create_time_entry`, `list_projects`,")
        lines.append("  `list_trackers`, `list_issue_statuses`")
        lines.append("")
        lines.append("```json")
        lines.append('{ "mcpServers": { "redmine": { "url": "http://localhost:3006/sse" } } }')
        lines.append("```\n")

    # Combined config
    lines.append("### Kết nối cả hai (khuyến nghị):")
    lines.append("```json")
    lines.append('{')
    lines.append('  "mcpServers": {')
    lines.append('    "dashboard": { "url": "http://localhost:3005/sse" },')
    if redmine_cfg.url:
        lines.append('    "redmine":   { "url": "http://localhost:3006/sse" }')
    lines.append('  }')
    lines.append('}')
    lines.append("```")
    lines.append("")
    lines.append(
        "_Thêm đoạn JSON trên vào `claude_desktop_config.json` "
        "rồi restart Claude Desktop để kích hoạt._\n"
    )

    # ── Footer ────────────────────────────────────────────────────────────────
    lines.append("---")
    lines.append(
        "_Context được tạo tự động từ DVC Data Management Dashboard. "
        "Paste nội dung này vào Claude/ChatGPT để bắt đầu, hoặc cài MCP servers "
        "để Claude Desktop truy cập dữ liệu trực tiếp._"
    )

    return {"markdown": "\n".join(lines)}
