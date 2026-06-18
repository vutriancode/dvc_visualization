import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Loader2, FolderKanban, Database,
  CheckCircle, Pause, LayoutList, Edit2, Trash2, X, Save,
  Tag, Calendar, Link2, Server, Cloud,
} from "lucide-react";
import {
  useManagedProjects, useCreateManagedProject,
  useUpdateManagedProject, useDeleteManagedProject,
} from "../hooks/useManagedProjects";
import { useProjects, useSSHDatasets } from "../hooks/useConfig";
import { useRcloneDatasets } from "../hooks/useRclone";
import { useRedmineProjects } from "../hooks/useRedmine";
import type { ManagedProject } from "../types";

const STATUS_CONFIG = {
  active:    { label: "Đang thực hiện", color: "bg-green-100 text-green-700",  icon: CheckCircle },
  planning:  { label: "Lên kế hoạch",   color: "bg-blue-100 text-blue-700",    icon: LayoutList  },
  paused:    { label: "Tạm dừng",        color: "bg-yellow-100 text-yellow-700", icon: Pause      },
  completed: { label: "Hoàn thành",      color: "bg-gray-100 text-gray-600",    icon: CheckCircle },
} as const;

const PROJECT_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

// ── Project form modal ────────────────────────────────────────────────────────

export function ProjectFormModal({
  project,
  onClose,
}: {
  project?: ManagedProject;
  onClose: () => void;
}) {
  const isEdit = !!project;
  const create = useCreateManagedProject();
  const update = useUpdateManagedProject();
  const { data: gitlabConfigs = [] } = useProjects();
  const { data: sshDatasets = [] } = useSSHDatasets();
  const { data: rcloneDatasets = [] } = useRcloneDatasets();
  const { data: redmineProjects = [] } = useRedmineProjects();

  const [form, setForm] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project?.status ?? "active",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
    tags: project?.tags.join(", ") ?? "",
    color: project?.color ?? PROJECT_COLORS[0],
    gitlab_config_id: project?.gitlab_config_id ?? "",
    redmine_project_id: project?.redmine_project_id ?? "",
  });
  const [sshIds, setSshIds] = useState<string[]>(project?.ssh_dataset_ids ?? []);
  const [rcloneIds, setRcloneIds] = useState<string[]>(project?.rclone_dataset_ids ?? []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleId = (
    ids: string[], setIds: React.Dispatch<React.SetStateAction<string[]>>, id: string,
  ) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const handleSubmit = async () => {
    const payload = {
      ...form,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      ssh_dataset_ids: sshIds,
      rclone_dataset_ids: rcloneIds,
    };
    if (isEdit) {
      await update.mutateAsync({ id: project.id, data: payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">{isEdit ? "Chỉnh sửa dự án" : "Tạo dự án mới"}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Name + color */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tên dự án *</label>
              <input
                type="text" autoFocus value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tên dự án..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Màu</label>
              <div className="flex gap-1.5 mt-1">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} onClick={() => set("color", c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${form.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mô tả</label>
            <textarea
              rows={2} value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Mô tả ngắn về dự án..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>

          {/* Status + dates */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Trạng thái</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none">
                {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Bắt đầu</label>
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Kết thúc</label>
              <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none" />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tags (phân cách bằng dấu phẩy)</label>
            <input type="text" value={form.tags} onChange={(e) => set("tags", e.target.value)}
              placeholder="AI, training, production..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Link2 size={11} /> Kết nối dữ liệu
            </p>

            {/* GitLab / DVC */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-1.5">
                <Database size={11} className="text-blue-500" /> Nguồn GitLab / DVC
              </label>
              <select value={form.gitlab_config_id} onChange={(e) => set("gitlab_config_id", e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none">
                <option value="">— Không liên kết —</option>
                {gitlabConfigs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            {/* SSH datasets */}
            {sshDatasets.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                  <Server size={11} className="text-gray-500" /> SSH Datasets
                </label>
                <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {sshDatasets.map((ds) => (
                    <label key={ds.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={sshIds.includes(ds.id)}
                        onChange={() => toggleId(sshIds, setSshIds, ds.id)}
                        className="rounded border-gray-300 text-blue-600 w-3 h-3" />
                      <span className="text-xs text-gray-700 font-medium">{ds.name}</span>
                      <span className="text-xs text-gray-400 truncate flex-1">{ds.path}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Rclone / Cloud datasets */}
            {rcloneDatasets.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1.5">
                  <Cloud size={11} className="text-sky-500" /> Cloud / Rclone Datasets
                </label>
                <div className="space-y-1 max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {rcloneDatasets.map((ds) => (
                    <label key={ds.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={rcloneIds.includes(ds.id)}
                        onChange={() => toggleId(rcloneIds, setRcloneIds, ds.id)}
                        className="rounded border-gray-300 text-blue-600 w-3 h-3" />
                      <span className="text-xs text-gray-700 font-medium">{ds.name}</span>
                      <span className="text-xs text-gray-400">{ds.remote}:{ds.path}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Redmine project */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-1.5">
                <svg className="w-3 h-3 text-red-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><path fill="white" d="M8 12h8M12 8v8" /></svg>
                Dự án Redmine
              </label>
              <select value={form.redmine_project_id} onChange={(e) => set("redmine_project_id", e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none">
                <option value="">— Không liên kết —</option>
                {redmineProjects.map((p) => (
                  <option key={p.id} value={p.identifier || String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
          <button onClick={handleSubmit} disabled={!form.name || isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isEdit ? "Lưu thay đổi" : "Tạo dự án"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onEdit, onDelete }: {
  project: ManagedProject;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const { label, color, icon: StatusIcon } = STATUS_CONFIG[project.status];

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer group overflow-hidden"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Color bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: project.color + "20" }}>
              <FolderKanban size={16} style={{ color: project.color }} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{project.name}</h3>
              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${color}`}>
                <StatusIcon size={9} /> {label}
              </span>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
              <Edit2 size={12} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{project.description}</p>
        )}

        {/* Links */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {project.gitlab_config_id && (
            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
              <Database size={9} /> DVC
            </span>
          )}
          {project.ssh_dataset_ids.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              <Server size={9} /> SSH ×{project.ssh_dataset_ids.length}
            </span>
          )}
          {project.rclone_dataset_ids.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full">
              <Cloud size={9} /> Cloud ×{project.rclone_dataset_ids.length}
            </span>
          )}
          {project.redmine_project_id && (
            <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /><path fill="white" d="M8 12h8M12 8v8" /></svg>
              Redmine
            </span>
          )}
          {project.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              <Tag size={9} /> {tag}
            </span>
          ))}
        </div>

        {/* Dates */}
        {(project.start_date || project.end_date) && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar size={10} />
            {project.start_date && <span>{new Date(project.start_date).toLocaleDateString("vi-VN")}</span>}
            {project.start_date && project.end_date && <span>→</span>}
            {project.end_date && <span>{new Date(project.end_date).toLocaleDateString("vi-VN")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useManagedProjects();
  const deleteProject = useDeleteManagedProject();

  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<ManagedProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => navigate("/")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg">
            <FolderKanban size={16} className="text-blue-600" />
          </div>
          <h1 className="font-semibold text-gray-900 text-sm">Quản lý dự án</h1>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Tạo dự án
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin text-gray-300" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="p-5 bg-gray-100 rounded-2xl">
              <FolderKanban size={36} className="text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Chưa có dự án nào</p>
            <p className="text-gray-400 text-xs">Tạo dự án để liên kết dataset và Redmine</p>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              <Plus size={14} /> Tạo dự án đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onEdit={() => setEditProject(p)}
                onDelete={() => setConfirmDelete(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {(showCreate || editProject) && (
        <ProjectFormModal
          project={editProject ?? undefined}
          onClose={() => { setShowCreate(false); setEditProject(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <p className="font-semibold text-gray-900 mb-1">Xóa dự án?</p>
            <p className="text-sm text-gray-500 mb-4">Hành động này không thể hoàn tác. Dữ liệu liên kết sẽ không bị xóa.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
              <button
                onClick={async () => { await deleteProject.mutateAsync(confirmDelete); setConfirmDelete(null); }}
                disabled={deleteProject.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleteProject.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
