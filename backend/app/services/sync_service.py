"""Background job service for CVAT → DVC sync tasks.

Source-of-truth hierarchy:
  Git   → .dvc file     (pointer: dir_md5 of what's currently tracked)
  MinIO → .dir index    (canonical file list: [{md5, relpath}])
  CVAT  → updated_date  (detect which jobs actually changed, no download)
  Git   → .cvat.json    (per-job metadata stored alongside .dvc in git history)

Sync algorithm:
  1. Read .dvc from git → dir_md5 → read .dir index from MinIO
     (empty on first sync or after .dvc deleted)
  2. Group .dir entries by job_id prefix → know what's currently tracked per job
  3. Read .cvat.json from git → per-job updated_date/size/nfiles
  4. Compare each CVAT completed job's updated_date with .cvat.json
     - Same → reuse files from MinIO .dir index, skip export
     - Different or missing → export that job from CVAT
  5. Upload only new files (skip if MD5 already in MinIO)
  6. Rebuild .dir index = unchanged files + new files
  7. Commit: .dvc + .cvat.json + .dvc/config (+ .gitignore if needed)
"""
import asyncio
import hashlib
import io
import json
import re
import uuid
import zipfile
from datetime import datetime
from typing import Optional

_jobs: dict[str, dict] = {}
_MAX_JOBS = 200

STEP_EXPORT = "export_cvat"
STEP_UPLOAD = "upload_minio"
STEP_COMMIT = "commit_gitlab"

_STEP_DEFS = [
    (STEP_EXPORT, "Phân tích & tải jobs thay đổi"),
    (STEP_UPLOAD, "Upload files mới lên MinIO"),
    (STEP_COMMIT, "Commit .dvc file vào GitLab"),
]


def _make_steps():
    return [{"name": n, "label": l, "status": "pending", "message": ""} for n, l in _STEP_DEFS]


def create_job(params: dict) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        **params,
        "status": "pending",
        "steps": _make_steps(),
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if len(_jobs) > _MAX_JOBS:
        oldest = sorted(_jobs, key=lambda k: _jobs[k]["created_at"])[:len(_jobs) - _MAX_JOBS]
        for k in oldest:
            del _jobs[k]
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


def list_jobs_for(cvat_project_id: int) -> list[dict]:
    return sorted(
        [j for j in _jobs.values() if j.get("cvat_project_id") == cvat_project_id],
        key=lambda j: j["created_at"],
        reverse=True,
    )


def _set_step(job: dict, step_name: str, status: str, message: str = "") -> None:
    for step in job["steps"]:
        if step["name"] == step_name:
            step["status"] = status
            step["message"] = message
            return


def _reset_steps_from(job: dict, step_name: str) -> None:
    found = False
    for step in job["steps"]:
        if step["name"] == step_name:
            found = True
        if found:
            step["status"] = "pending"
            step["message"] = ""


def retry_job(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job or job["status"] != "error":
        return
    failed_step = next((s["name"] for s in job["steps"] if s["status"] == "error"), None)
    if not failed_step:
        return
    job["status"] = "running"
    job["error"] = None
    job["result"] = None
    if failed_step == STEP_COMMIT and "_dir_md5" in job:
        _set_step(job, STEP_EXPORT, "done", job.get("_export_msg", "cached"))
        _set_step(job, STEP_UPLOAD, "done", job.get("_upload_msg", "cached"))
        _reset_steps_from(job, STEP_COMMIT)
        asyncio.create_task(_run_commit_only(job_id))
    else:
        _reset_steps_from(job, STEP_EXPORT)
        asyncio.create_task(run_sync(job_id))


# ── Git/MinIO helpers ─────────────────────────────────────────────────────────

def _cvat_json_path(dvc_path: str, dir_name: str) -> str:
    """Path of the per-project sync metadata file committed to git."""
    return f"{dvc_path}/{dir_name}.cvat.json"


def _dvc_file_path(dvc_path: str, dir_name: str) -> str:
    return f"{dvc_path}/{dir_name}.dvc"


def _parse_dir_md5(dvc_content: str) -> str | None:
    """Extract the dir md5 (without .dir suffix) from .dvc file content."""
    m = re.search(r"md5:\s+([a-f0-9]+)\.dir", dvc_content)
    return m.group(1) if m else None


async def _read_minio_dir_index(minio_service, dir_md5: str) -> list[dict]:
    """Fetch and parse the .dir JSON index from MinIO. Returns [] if missing."""
    raw = minio_service.get_dvc_object(dir_md5)
    if not raw:
        return []
    return json.loads(raw)


def _group_dir_by_job(dir_entries: list[dict]) -> dict[str, list[dict]]:
    """Group .dir entries by job id extracted from relpath prefix job_{id}/."""
    by_job: dict[str, list[dict]] = {}
    for entry in dir_entries:
        m = re.match(r"^job_(\d+)/", entry["relpath"])
        if m:
            by_job.setdefault(m.group(1), []).append(entry)
    return by_job


def _load_cvat_json(raw: str | None) -> dict:
    if not raw:
        return {"version": 1, "jobs": {}}
    try:
        return json.loads(raw)
    except Exception:
        return {"version": 1, "jobs": {}}


def _dvc_remote_config(minio_cfg) -> str:
    """Generate .dvc/config content (committed, no credentials).

    DVC 3.x reads credentials from .dvc/config.local (not committed).
    Each user must run once:
      dvc remote modify minio access_key_id <key> --local
      dvc remote modify minio secret_access_key <secret> --local
    """
    endpoint = minio_cfg.endpoint.strip().rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        scheme = "https" if minio_cfg.use_ssl else "http"
        endpoint = f"{scheme}://{endpoint}"
    return (
        "[core]\n"
        "    remote = minio\n"
        "['remote \"minio\"']\n"
        f"    url = s3://{minio_cfg.bucket}\n"
        f"    endpointurl = {endpoint}\n"
    )


# ── Commit step ───────────────────────────────────────────────────────────────

async def _do_commit_step(
    job: dict,
    dir_md5: str, total_size: int, nfiles: int, dir_name: str,
    new_cvat_json: dict,
) -> None:
    from app.services.gitlab_service import gitlab_service
    from app.services.config_service import config_service as cs

    _set_step(job, STEP_COMMIT, "running", "Đang commit vào GitLab…")

    gl_project = cs.get_project(job["gitlab_config_id"])
    if not gl_project:
        _set_step(job, STEP_COMMIT, "error", "GitLab config không tồn tại")
        job["status"] = "error"
        job["error"] = "GitLab config not found"
        return

    minio_cfg = cs.get_minio()
    dvc_path = job["dvc_path"].strip("/")
    dvc_fp = _dvc_file_path(dvc_path, dir_name)
    cvat_json_fp = _cvat_json_path(dvc_path, dir_name)
    gitignore_fp = f"{dvc_path}/.gitignore"

    dvc_content = (
        f"outs:\n"
        f"- md5: {dir_md5}.dir\n"
        f"  size: {total_size}\n"
        f"  nfiles: {nfiles}\n"
        f"  path: {dir_name}\n"
    )
    dvc_cfg_content = _dvc_remote_config(minio_cfg)
    cvat_json_content = json.dumps(new_cvat_json, ensure_ascii=False, indent=2)

    branch = await gitlab_service.get_default_branch(gl_project)

    try:
        existing_gi      = await gitlab_service.get_file_content(gl_project, gitignore_fp, branch) or ""
        existing_dvc     = await gitlab_service.get_file_content(gl_project, dvc_fp, branch)
        existing_cvat    = await gitlab_service.get_file_content(gl_project, cvat_json_fp, branch)
        existing_dvc_cfg = await gitlab_service.get_file_content(gl_project, ".dvc/config", branch)
        existing_dvc_gi  = await gitlab_service.get_file_content(gl_project, ".dvc/.gitignore", branch)

        entry = f"/{dir_name}"
        new_gi = existing_gi if entry in existing_gi else (existing_gi.rstrip("\n") + "\n" + entry + "\n")

        actions: list[dict] = [
            {
                "action": "create" if not existing_dvc else "update",
                "file_path": dvc_fp,
                "content": dvc_content,
            },
            {
                "action": "create" if not existing_cvat else "update",
                "file_path": cvat_json_fp,
                "content": cvat_json_content,
            },
        ]
        if new_gi != existing_gi or not existing_gi:
            actions.append({
                "action": "create" if not existing_gi else "update",
                "file_path": gitignore_fp,
                "content": new_gi,
            })
        if not existing_dvc_cfg or existing_dvc_cfg.strip() != dvc_cfg_content.strip():
            actions.append({
                "action": "create" if not existing_dvc_cfg else "update",
                "file_path": ".dvc/config",
                "content": dvc_cfg_content,
            })
        if not existing_dvc_gi:
            actions.append({
                "action": "create",
                "file_path": ".dvc/.gitignore",
                "content": "/tmp\n/cache\n/lock\n",
            })

        commit = await gitlab_service.commit_files(
            gl_project, branch,
            f"sync: CVAT project {job['cvat_project_id']} -> DVC ({job['export_format']})",
            actions,
        )
        commit_id = commit.get("id", "")
        commit_url = commit.get("web_url", "")
        _set_step(job, STEP_COMMIT, "done", f"commit {commit_id[:8]}")
    except Exception as e:
        _set_step(job, STEP_COMMIT, "error", str(e))
        job["status"] = "error"
        job["error"] = f"GitLab commit thất bại: {e}"
        return

    job["status"] = "done"
    job["result"] = {
        "ok": True,
        "dvc_file": dvc_fp,
        "md5": f"{dir_md5}.dir",
        "size_bytes": total_size,
        "nfiles": nfiles,
        "dir_name": dir_name,
        "commit_id": commit_id,
        "commit_url": commit_url,
    }


async def _run_commit_only(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    await _do_commit_step(
        job,
        job["_dir_md5"], job["_total_size"], job["_nfiles"], job["_dir_name"],
        job["_new_cvat_json"],
    )


# ── Main sync ─────────────────────────────────────────────────────────────────

async def run_sync(job_id: str) -> None:
    from app.services.cvat_service import cvat_service
    from app.services.minio_service import minio_service
    from app.services.gitlab_service import gitlab_service
    from app.services.config_service import config_service as cs

    job = _jobs.get(job_id)
    if not job:
        return
    job["status"] = "running"

    cvat_project_id: int = job["cvat_project_id"]
    format_name: str = job["export_format"]
    dir_name = f"cvat_project_{cvat_project_id}"

    # ── Step 1: Phân tích jobs thay đổi ──────────────────────────────────────
    _set_step(job, STEP_EXPORT, "running", "Đang đọc trạng thái hiện tại từ Git + MinIO…")
    try:
        gl_project = cs.get_project(job["gitlab_config_id"])
        if not gl_project:
            raise RuntimeError("GitLab config không tồn tại")

        dvc_path = job["dvc_path"].strip("/")
        branch = await gitlab_service.get_default_branch(gl_project)

        # 1a. Đọc .dvc file từ git → lấy dir_md5 → đọc .dir index từ MinIO
        existing_dvc_raw = await gitlab_service.get_file_content(
            gl_project, _dvc_file_path(dvc_path, dir_name), branch
        )
        current_dir_md5 = _parse_dir_md5(existing_dvc_raw or "")
        current_dir_entries: list[dict] = []
        dir_by_job: dict[str, list[dict]] = {}
        if current_dir_md5:
            current_dir_entries = await asyncio.get_event_loop().run_in_executor(
                None, _read_minio_dir_index_sync, minio_service, current_dir_md5
            )
            dir_by_job = _group_dir_by_job(current_dir_entries)

        # 1b. Đọc .cvat.json từ git (per-job metadata)
        cvat_json_raw = await gitlab_service.get_file_content(
            gl_project, _cvat_json_path(dvc_path, dir_name), branch
        )
        prev_cvat = _load_cvat_json(cvat_json_raw)

        # 1c. Lấy completed jobs từ CVAT
        all_jobs = await cvat_service.list_jobs(project_id=cvat_project_id)
        completed = [j for j in all_jobs if (j.get("state") or j.get("status")) == "completed"]
        if not completed:
            raise RuntimeError("Không có job nào hoàn thành (completed)")

        # 1d. So sánh updated_date → phân loại changed/unchanged
        changed_jobs: list[dict] = []
        unchanged_jobs: list[dict] = []

        for j in completed:
            jid = str(j["id"])
            stored = prev_cvat["jobs"].get(jid)
            in_dir = jid in dir_by_job
            # Job chưa đổi nếu: updated_date khớp VÀ files đang có trong .dir index
            if stored and stored.get("updated_date") == j.get("updated_date", "") and in_dir:
                unchanged_jobs.append(j)
            else:
                changed_jobs.append(j)

        n_changed = len(changed_jobs)
        n_unchanged = len(unchanged_jobs)
        source = "Git+MinIO" if current_dir_md5 else "lần đầu sync"
        _set_step(job, STEP_EXPORT, "running",
                  f"[{source}] {n_changed} jobs thay đổi / {n_unchanged} không đổi — đang tải…")

        # 1e. Export chỉ các job thay đổi (tuần tự, tránh quá tải CVAT)
        new_job_entries: dict[str, list[dict]] = {}   # jid → [{md5, relpath, size}]
        new_raw_files: list[tuple[str, bytes, str]] = []  # (relpath, data, md5)

        for idx, cjob in enumerate(changed_jobs):
            jid = str(cjob["id"])
            _set_step(job, STEP_EXPORT, "running",
                      f"Tải job {idx + 1}/{n_changed} (#{cjob['id']})…")
            zip_data = await cvat_service.export_single_job(cjob["id"], format_name)

            entries: list[dict] = []
            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                for name in zf.namelist():
                    if name.endswith("/"):
                        continue
                    data = zf.read(name)
                    relpath = f"job_{cjob['id']}/{name}"
                    file_md5 = hashlib.md5(data).hexdigest()
                    entries.append({"md5": file_md5, "relpath": relpath, "size": len(data)})
                    new_raw_files.append((relpath, data, file_md5))

            new_job_entries[jid] = entries

        export_msg = (
            f"{n_changed} jobs mới/thay đổi ({len(new_raw_files)} files mới), "
            f"{n_unchanged} jobs giữ nguyên từ {source}"
        )
        _set_step(job, STEP_EXPORT, "done", export_msg)
        job["_export_msg"] = export_msg

    except Exception as e:
        _set_step(job, STEP_EXPORT, "error", str(e))
        job["status"] = "error"
        job["error"] = f"CVAT export thất bại: {e}"
        return

    # ── Step 2: Upload chỉ files mới lên MinIO ───────────────────────────────
    _set_step(job, STEP_UPLOAD, "running", "Đang upload files mới…")
    try:
        total_new = len(new_raw_files)
        uploaded = skipped = 0

        for i, (relpath, data, file_md5) in enumerate(new_raw_files):
            if minio_service.dvc_object_exists(file_md5):
                skipped += 1
            else:
                minio_service.upload_dvc_object(file_md5, data)
                uploaded += 1
            if total_new and ((i + 1) % 20 == 0 or (i + 1) == total_new):
                _set_step(job, STEP_UPLOAD, "running",
                          f"{i + 1}/{total_new} · upload: {uploaded}, đã có: {skipped}")

        # Gộp .dir entries:
        #   - File của unchanged jobs: lấy từ MinIO .dir index hiện tại (đã đọc ở bước 1)
        #   - File của changed/new jobs: từ export vừa rồi
        unchanged_dir_entries: list[dict] = []
        for j in unchanged_jobs:
            jid = str(j["id"])
            for entry in dir_by_job.get(jid, []):
                unchanged_dir_entries.append({"md5": entry["md5"], "relpath": entry["relpath"]})

        new_dir_entries: list[dict] = []
        for entries in new_job_entries.values():
            for e in entries:
                new_dir_entries.append({"md5": e["md5"], "relpath": e["relpath"]})

        all_dir_entries = unchanged_dir_entries + new_dir_entries
        all_dir_entries.sort(key=lambda x: x["relpath"])

        # Upload .dir index mới
        dir_json = json.dumps(all_dir_entries, separators=(",", ":")).encode()
        dir_md5 = hashlib.md5(dir_json).hexdigest()
        minio_service.upload_dvc_object(dir_md5, dir_json)

        # Tính tổng size
        unchanged_size = sum(
            prev_cvat["jobs"].get(str(j["id"]), {}).get("size", 0) for j in unchanged_jobs
        )
        new_size = sum(e["size"] for entries in new_job_entries.values() for e in entries)
        total_size = unchanged_size + new_size
        total_files = len(all_dir_entries)

        upload_msg = (
            f"{total_files} files · {total_size / 1024 / 1024:.1f} MB"
            + (f" · {uploaded} upload mới / {skipped} đã có" if total_new else " · không có file mới")
        )
        _set_step(job, STEP_UPLOAD, "done", upload_msg)

        # Build .cvat.json mới để commit cùng git
        new_cvat_json: dict = {
            "version": 1,
            "synced_at": datetime.utcnow().isoformat() + "Z",
            "jobs": {},
        }
        for j in completed:
            jid = str(j["id"])
            if jid in new_job_entries:
                entries = new_job_entries[jid]
                new_cvat_json["jobs"][jid] = {
                    "updated_date": j.get("updated_date", ""),
                    "nfiles": len(entries),
                    "size": sum(e["size"] for e in entries),
                }
            else:
                # Giữ metadata cũ cho job không đổi
                new_cvat_json["jobs"][jid] = prev_cvat["jobs"].get(jid, {
                    "updated_date": j.get("updated_date", ""),
                    "nfiles": len(dir_by_job.get(jid, [])),
                    "size": 0,
                })

        # Cache cho retry commit-only
        job["_dir_md5"] = dir_md5
        job["_total_size"] = total_size
        job["_nfiles"] = total_files
        job["_dir_name"] = dir_name
        job["_new_cvat_json"] = new_cvat_json
        job["_upload_msg"] = upload_msg

    except Exception as e:
        _set_step(job, STEP_UPLOAD, "error", str(e))
        job["status"] = "error"
        job["error"] = f"MinIO upload thất bại: {e}"
        return

    # ── Step 3: Commit vào GitLab ─────────────────────────────────────────────
    await _do_commit_step(job, dir_md5, total_size, total_files, dir_name, new_cvat_json)


def _read_minio_dir_index_sync(minio_service, dir_md5: str) -> list[dict]:
    """Sync wrapper for reading .dir index (called via run_in_executor)."""
    raw = minio_service.get_dvc_object(dir_md5)
    if not raw:
        return []
    return json.loads(raw)
