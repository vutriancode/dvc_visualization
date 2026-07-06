import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Loader2, FolderKanban, Database, CheckSquare,
  BarChart2, Info, Edit2, Tag, Link2, Users,
  CheckCircle, LayoutList, Pause, ClipboardList, Flag,
  Search, Server, Cloud, Layers, RefreshCw, Clock, XCircle, ExternalLink,
} from "lucide-react";
import { useManagedProject, useManagedProjectSummary } from "../hooks/useManagedProjects";
import { useRedmineMembers, useRedmineIssues, useRedmineStatusMapping } from "../hooks/useRedmine";
import { useDatasets } from "../hooks/useDatasets";
import { useProjects, useSSHDatasets } from "../hooks/useConfig";
import { useRcloneDatasets } from "../hooks/useRclone";
import { useCVATProjects, useCVATStats, useSyncCVATtoDVC, useSyncJob, useRetrySyncJob } from "../hooks/useCVAT";
import type { SyncStep } from "../hooks/useCVAT";
import { RedmineStats } from "../components/RedmineStats";
import { ProjectFormModal } from "./ProjectsPage";
import type { ManagedProject, RedmineIssue, CVATUserStat, CVATProjectLink } from "../types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const STATUS_CONFIG = {
  active:    { label: "Đang thực hiện", color: "bg-green-100 text-green-700",  icon: CheckCircle },
  planning:  { label: "Lên kế hoạch",   color: "bg-blue-100 text-blue-700",    icon: LayoutList  },
  paused:    { label: "Tạm dừng",        color: "bg-yellow-100 text-yellow-700", icon: Pause      },
  completed: { label: "Hoàn thành",      color: "bg-gray-100 text-gray-600",    icon: CheckCircle },
} as const;

type Tab = "overview" | "datasets" | "tasks" | "stats" | "cvat";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Tổng quan",  icon: Info        },
  { id: "datasets",  label: "Datasets",   icon: Database    },
  { id: "tasks",     label: "Tasks",      icon: CheckSquare },
  { id: "stats",     label: "Thống kê",   icon: BarChart2   },
  { id: "cvat",      label: "CVAT",       icon: Layers      },
];

const CVAT_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#64748b",
];

const PRIORITY_COLORS: Record<string, string> = {
  Low: "text-gray-400", Normal: "text-blue-500",
  High: "text-orange-500", Urgent: "text-red-500", Immediate: "text-red-700",
};

function formatDateVN(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ project }: { project: ManagedProject }) {
  const { data: summary, isLoading } = useManagedProjectSummary(project.id);
  const { label, color, icon: StatusIcon } = STATUS_CONFIG[project.status];
  const { data: gitlabConfigs = [] } = useProjects();
  const { data: allSsh = [] } = useSSHDatasets();
  const { data: allRclone = [] } = useRcloneDatasets();
  const { data: allCvat = [] } = useCVATProjects();
  const linkedGitlab = gitlabConfigs.find((g) => g.id === project.gitlab_config_id);
  const linkedSsh = allSsh.filter((d) => project.ssh_dataset_ids.includes(d.id));
  const linkedRclone = allRclone.filter((d) => project.rclone_dataset_ids.includes(d.id));
  const linkedCvat = allCvat.filter((p) => (project.cvat_links ?? []).some((l) => l.cvat_project_id === p.id));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Datasets",     val: summary?.dataset_count,    icon: Database,      bg: "bg-blue-50",   fg: "text-blue-600"   },
          { label: "Tasks mở",     val: summary?.open_task_count,  icon: ClipboardList, bg: "bg-orange-50", fg: "text-orange-600" },
          { label: "Tổng tasks",   val: summary?.total_task_count, icon: CheckSquare,   bg: "bg-green-50",  fg: "text-green-600"  },
          { label: "Thành viên",   val: summary?.member_count,     icon: Users,         bg: "bg-purple-50", fg: "text-purple-600" },
        ].map(({ label: l, val, icon: Icon, bg, fg }) => (
          <div key={l} className={`rounded-xl p-4 ${bg} flex items-center gap-3`}>
            <Icon size={20} className={fg} />
            <div>
              <p className={`text-xl font-bold ${fg}`}>
                {isLoading ? <Loader2 size={16} className="animate-spin inline" /> : (val ?? "—")}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{l}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Thông tin dự án</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Trạng thái</p>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
              <StatusIcon size={10} />{label}
            </span>
          </div>
          {project.start_date && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Bắt đầu</p>
              <p className="font-medium text-gray-800">{formatDateVN(project.start_date)}</p>
            </div>
          )}
          {project.end_date && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Kết thúc</p>
              <p className="font-medium text-gray-800">{formatDateVN(project.end_date)}</p>
            </div>
          )}
        </div>
        {project.description && (
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Mô tả</p>
            <p className="text-sm text-gray-700">{project.description}</p>
          </div>
        )}
        {project.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {project.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                <Tag size={9} /> {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Link2 size={13} /> Kết nối dữ liệu</h3>
        <div className="space-y-2">
          {/* GitLab */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Database size={16} className={project.gitlab_config_id ? "text-blue-500" : "text-gray-300"} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700">GitLab / DVC</p>
              <p className="text-xs text-gray-400 truncate">
                {linkedGitlab ? linkedGitlab.name : project.gitlab_config_id ? project.gitlab_config_id : "Chưa liên kết"}
              </p>
            </div>
          </div>
          {/* SSH datasets */}
          {linkedSsh.length > 0 && linkedSsh.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Server size={16} className="text-gray-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700">{d.name} <span className="text-gray-400 font-normal">· SSH</span></p>
                <p className="text-xs text-gray-400 truncate">{d.path}</p>
              </div>
            </div>
          ))}
          {/* Rclone datasets */}
          {linkedRclone.length > 0 && linkedRclone.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Cloud size={16} className="text-sky-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700">{d.name} <span className="text-gray-400 font-normal">· {d.provider}</span></p>
                <p className="text-xs text-gray-400 truncate">{d.remote}:{d.path}</p>
              </div>
            </div>
          ))}
          {/* Redmine */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <svg className={`w-4 h-4 flex-shrink-0 ${project.redmine_project_id ? "text-red-500" : "text-gray-300"}`} viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" /><path fill="white" d="M8 12h8M12 8v8" />
            </svg>
            <div>
              <p className="text-xs font-medium text-gray-700">Dự án Redmine</p>
              <p className="text-xs text-gray-400">{project.redmine_project_id || "Chưa liên kết"}</p>
            </div>
          </div>
          {/* CVAT */}
          {linkedCvat.length > 0 ? linkedCvat.map((cp) => {
            const link = project.cvat_links.find((l) => l.cvat_project_id === cp.id)!;
            const glProject = gitlabConfigs.find((g) => g.id === link.gitlab_config_id);
            return (
              <div key={cp.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <svg className="w-4 h-4 flex-shrink-0 text-violet-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-gray-700">{cp.name} <span className="text-gray-400 font-normal">· CVAT #{cp.id}</span></p>
                  {glProject && <p className="text-xs text-gray-400">→ {glProject.name} / {link.dvc_path}</p>}
                  <p className="text-xs text-gray-400">{link.export_format}</p>
                </div>
              </div>
            );
          }) : (project.cvat_links ?? []).length === 0 && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <svg className="w-4 h-4 flex-shrink-0 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
              </svg>
              <div>
                <p className="text-xs font-medium text-gray-700">CVAT</p>
                <p className="text-xs text-gray-400">Chưa liên kết</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Datasets tab ──────────────────────────────────────────────────────────────

function DatasetsTab({ project }: { project: ManagedProject }) {
  const navToDataset = useNavigate();
  const [search, setSearch] = useState("");

  const { data: dvcDatasets = [], isLoading: dvcLoading } = useDatasets(
    project.gitlab_config_id, search,
  );
  const { data: allSsh = [] } = useSSHDatasets();
  const { data: allRclone = [] } = useRcloneDatasets();

  const sshDatasets = allSsh.filter((d) => project.ssh_dataset_ids.includes(d.id));
  const rcloneDatasets = allRclone.filter((d) => project.rclone_dataset_ids.includes(d.id));

  const hasAny = project.gitlab_config_id || project.ssh_dataset_ids.length > 0 || project.rclone_dataset_ids.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Database size={32} className="text-gray-200" />
        <p className="text-sm text-gray-400">Chưa liên kết nguồn dữ liệu</p>
        <p className="text-xs text-gray-300">Chỉnh sửa dự án để thêm GitLab, SSH hoặc Cloud</p>
      </div>
    );
  }

  const searchLower = search.toLowerCase();
  const filteredSsh = sshDatasets.filter((d) => !search || d.name.toLowerCase().includes(searchLower) || d.path.toLowerCase().includes(searchLower));
  const filteredRclone = rcloneDatasets.filter((d) => !search || d.name.toLowerCase().includes(searchLower));

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center gap-2">
        <Search size={13} className="text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm dataset..." className="flex-1 text-sm outline-none bg-transparent" />
      </div>

      {/* DVC / GitLab */}
      {project.gitlab_config_id && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-blue-50 border-b border-gray-100 flex items-center gap-1.5">
            <Database size={12} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">GitLab / DVC</span>
          </div>
          {dvcLoading ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
          ) : dvcDatasets.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">Không có dataset DVC</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Tên</th>
                <th className="px-4 py-2 text-left font-medium">Đường dẫn</th>
                <th className="px-4 py-2 text-right font-medium">Phiên bản</th>
                <th className="px-4 py-2 text-left font-medium">Cập nhật</th>
              </tr></thead>
              <tbody>
                {dvcDatasets.map((ds) => (
                  <tr key={ds.name} onClick={() => navToDataset(`/datasets/${ds.project_id}/${ds.name}`)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-800 truncate max-w-[180px]">{ds.name}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[160px]">{ds.path}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{ds.version_count}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{formatDateVN(ds.last_modified ?? undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SSH */}
      {sshDatasets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
            <Server size={12} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-700">SSH</span>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Tên</th>
              <th className="px-4 py-2 text-left font-medium">Đường dẫn</th>
            </tr></thead>
            <tbody>
              {filteredSsh.map((ds) => (
                <tr key={ds.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{ds.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{ds.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rclone / Cloud */}
      {rcloneDatasets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-sky-50 border-b border-gray-100 flex items-center gap-1.5">
            <Cloud size={12} className="text-sky-500" />
            <span className="text-xs font-semibold text-sky-700">Cloud / Rclone</span>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Tên</th>
              <th className="px-4 py-2 text-left font-medium">Remote</th>
              <th className="px-4 py-2 text-left font-medium">Đường dẫn</th>
            </tr></thead>
            <tbody>
              {filteredRclone.map((ds) => (
                <tr key={ds.id} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{ds.name}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">{ds.remote}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{ds.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ redmineProjectId }: { redmineProjectId: string }) {
  const [statusFilter, setStatusFilter] = useState<"*" | "open" | "closed">("open");
  const { data: mapping = {} } = useRedmineStatusMapping();

  const { data, isLoading } = useRedmineIssues({
    project_id: redmineProjectId,
    status_id: statusFilter,
    limit: 50,
    offset: 0,
  });

  const issues: RedmineIssue[] = data?.issues ?? [];

  if (!redmineProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <CheckSquare size={32} className="text-gray-200" />
        <p className="text-sm text-gray-400">Chưa liên kết dự án Redmine</p>
        <p className="text-xs text-gray-300">Chỉnh sửa dự án để thêm liên kết</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <div className="flex gap-1">
          {(["open", "*", "closed"] as const).map((v) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {v === "open" ? "Đang mở" : v === "*" ? "Tất cả" : "Đã đóng"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{data?.total_count ?? 0} tasks</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
      ) : issues.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Không có task nào</div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
            <th className="px-3 py-2 text-left font-medium w-16">#</th>
            <th className="px-3 py-2 text-left font-medium">Tiêu đề</th>
            <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
            <th className="px-3 py-2 text-left font-medium">Ưu tiên</th>
            <th className="px-3 py-2 text-left font-medium">Giao cho</th>
          </tr></thead>
          <tbody>
            {issues.map((issue) => {
              const catColor = (mapping[String(issue.status.id)] ?? (issue.status.is_closed ? "done" : "todo")) === "done"
                ? "bg-green-100 text-green-700"
                : (mapping[String(issue.status.id)] ?? "todo") === "in_progress"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-blue-100 text-blue-700";
              const priCls = PRIORITY_COLORS[issue.priority.name] ?? "text-gray-400";
              return (
                <tr key={issue.id} className="border-b border-gray-50 hover:bg-blue-50/40">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">#{issue.id}</td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <span className="text-gray-800 line-clamp-1">{issue.subject}</span>
                    <span className="text-xs text-gray-400 mt-0.5">{issue.tracker.name}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${catColor}`}>
                      {issue.status.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`flex items-center gap-1 text-xs ${priCls}`}>
                      <Flag size={10} /> {issue.priority.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{issue.assigned_to?.name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ redmineProjectId }: { redmineProjectId: string }) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const { data: members = [] } = useRedmineMembers(redmineProjectId || null);

  if (!redmineProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <BarChart2 size={32} className="text-gray-200" />
        <p className="text-sm text-gray-400">Chưa liên kết dự án Redmine</p>
        <p className="text-xs text-gray-300">Chỉnh sửa dự án để thêm liên kết</p>
      </div>
    );
  }

  return (
    <RedmineStats
      projectId={redmineProjectId}
      members={members}
      selectedMemberIds={selectedMemberIds}
      onMemberSelectionChange={setSelectedMemberIds}
    />
  );
}

// ── CVAT tab ─────────────────────────────────────────────────────────────────

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 25);
  const to   = new Date(now.getFullYear(), now.getMonth(), 25);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function stepIcon(status: SyncStep["status"]) {
  if (status === "running") return <Loader2 size={12} className="animate-spin text-blue-500 flex-shrink-0" />;
  if (status === "done")    return <CheckCircle size={12} className="text-green-500 flex-shrink-0" />;
  if (status === "error")   return <XCircle size={12} className="text-red-500 flex-shrink-0" />;
  return <Clock size={12} className="text-gray-300 flex-shrink-0" />;
}

function CvatProjectStats({ projectId, fromDate, toDate, groupBy, link }: {
  projectId: number; fromDate: string; toDate: string; groupBy: "day" | "week" | "month";
  link: CVATProjectLink;
}) {
  const { data: stats, isLoading, error } = useCVATStats({ project_id: projectId, from_date: fromDate, to_date: toDate, group_by: groupBy });
  const sync = useSyncCVATtoDVC();
  const retry = useRetrySyncJob();
  const canSync = !!link.gitlab_config_id;

  // Persist job_id in localStorage so poll survives page reload
  const lsKey = `cvat_sync_job_${link.cvat_project_id}`;
  const [jobId, setJobId] = useState<string | null>(() => localStorage.getItem(lsKey));
  const { data: syncJob } = useSyncJob(jobId);

  const handleSync = () => {
    sync.mutate(
      {
        cvat_project_id: link.cvat_project_id,
        gitlab_config_id: link.gitlab_config_id,
        dvc_path: link.dvc_path,
        export_format: link.export_format,
      },
      {
        onSuccess: (res) => {
          localStorage.setItem(lsKey, res.job_id);
          setJobId(res.job_id);
        },
      }
    );
  };

  const jobActive = syncJob?.status === "pending" || syncJob?.status === "running";
  const jobDone   = syncJob?.status === "done";
  const jobError  = syncJob?.status === "error";

  const chartData = stats ? stats.timeline.map((entry) => {
    const row: Record<string, string | number> = { period: entry.period };
    stats.users.forEach((u) => { row[u.display_name || u.username] = entry.users[String(u.id)] ?? 0; });
    return row;
  }) : [];

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-gray-300" /></div>;
  if (error) return <p className="text-xs text-red-500 px-4 py-3">{(error as Error).message}</p>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-100 rounded-full h-2">
          <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${stats.progress_pct}%` }} />
        </div>
        <span className="text-xs font-bold text-violet-600 w-10 text-right">{stats.progress_pct}%</span>
        <span className="text-xs text-gray-400">{stats.completed_jobs}/{stats.total_jobs} jobs</span>
      </div>

      {/* Per-user */}
      {stats.users.length > 0 && (
        <table className="w-full text-xs">
          <thead><tr className="text-gray-400 border-b border-gray-100">
            <th className="pb-1.5 text-left font-medium">Thành viên</th>
            <th className="pb-1.5 text-right font-medium">Jobs</th>
            <th className="pb-1.5 text-right font-medium">Frames</th>
            <th className="pb-1.5 text-right font-medium">Frames/ngày</th>
          </tr></thead>
          <tbody>
            {stats.users
              .slice()
              .sort((a: CVATUserStat, b: CVATUserStat) => b.frames_completed - a.frames_completed)
              .map((u: CVATUserStat, i: number) => (
                <tr key={u.id} className="border-b border-gray-50">
                  <td className="py-1.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CVAT_COLORS[i % CVAT_COLORS.length] }} />
                    <span className="font-medium text-gray-700">{u.display_name || u.username}</span>
                  </td>
                  <td className="py-1.5 text-right text-green-600 font-medium">{u.jobs_completed}</td>
                  <td className="py-1.5 text-right text-gray-600">{u.frames_completed.toLocaleString()}</td>
                  <td className="py-1.5 text-right text-violet-600 font-medium">{u.frames_per_day}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {/* Timeline chart */}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {stats.users.map((u: CVATUserStat, i: number) => (
              <Bar key={u.id} dataKey={u.display_name || u.username} stackId="a"
                fill={CVAT_COLORS[i % CVAT_COLORS.length]}
                radius={i === stats.users.length - 1 ? [3, 3, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {stats.users.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">Không có dữ liệu trong kỳ này.</p>
      )}

      {canSync && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {/* Sync button + result */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSync}
              disabled={sync.isPending || jobActive}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {(sync.isPending || jobActive)
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              {sync.isPending ? "Đang khởi tạo..." : jobActive ? "Đang sync..." : "Sync lên DVC"}
            </button>

            {jobDone && syncJob?.result && (
              <a href={syncJob.result.commit_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-green-600 flex items-center gap-1 hover:underline">
                <ExternalLink size={11} />
                <span className="font-mono">{syncJob.result.dvc_file}</span>
              </a>
            )}
            {jobError && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-red-500 flex-1">{syncJob?.error}</span>
                <button
                  onClick={() => retry.mutate(jobId!)}
                  disabled={retry.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {retry.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  Thử lại
                </button>
              </div>
            )}
            {sync.isError && !jobId && (
              <span className="text-xs text-red-500">{sync.error.message}</span>
            )}
          </div>

          {/* Per-step progress */}
          {syncJob && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
              {syncJob.steps.map((step: SyncStep) => (
                <div key={step.name} className="flex items-center gap-2 min-w-0">
                  {stepIcon(step.status)}
                  <span className={`text-xs font-medium flex-shrink-0 ${
                    step.status === "done"    ? "text-green-700"
                    : step.status === "error"   ? "text-red-600"
                    : step.status === "running" ? "text-blue-600"
                    : "text-gray-400"
                  }`}>{step.label}</span>
                  {step.message && (
                    <span className="text-xs text-gray-400 truncate">{step.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CvatTab({ cvatLinks }: { cvatLinks: CVATProjectLink[] }) {
  const { from, to } = defaultRange();
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const { data: allCvat = [] } = useCVATProjects();

  const linkedProjects = allCvat.filter((p) => cvatLinks.some((l) => l.cvat_project_id === p.id));

  if (cvatLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Layers size={32} className="text-gray-200" />
        <p className="text-sm text-gray-400">Chưa liên kết dự án CVAT</p>
        <p className="text-xs text-gray-300">Chỉnh sửa dự án để thêm liên kết CVAT</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(["day", "week", "month"] as const).map((g) => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${groupBy === g ? "bg-white text-violet-600 shadow-sm" : "text-gray-500"}`}>
              {g === "day" ? "Ngày" : g === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
      </div>

      {/* Per CVAT project */}
      {linkedProjects.map((cp) => {
        const link = cvatLinks.find((l) => l.cvat_project_id === cp.id)!;
        return (
          <div key={cp.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
              </svg>
              <span className="text-xs font-semibold text-violet-700">{cp.name}</span>
              <span className="text-xs text-violet-400">#{cp.id}</span>
            </div>
            <div className="p-4">
              <CvatProjectStats projectId={cp.id} fromDate={fromDate} toDate={toDate} groupBy={groupBy} link={link} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = useManagedProject(id ?? null);
  const [tab, setTab] = useState<Tab>("overview");
  const [showEdit, setShowEdit] = useState(false);

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => navigate("/projects")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          <ArrowLeft size={16} />
        </button>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: project.color + "20" }}>
          <FolderKanban size={14} style={{ color: project.color }} />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-gray-900 text-sm leading-tight">{project.name}</h1>
          {project.description && <p className="text-xs text-gray-400 truncate max-w-xs">{project.description}</p>}
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200">
          <Edit2 size={12} /> Chỉnh sửa
        </button>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 flex gap-0.5 flex-shrink-0">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button key={tid} onClick={() => setTab(tid)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === tid ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
            }`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {tab === "overview" && <OverviewTab project={project} />}
        {tab === "datasets" && <DatasetsTab project={project} />}
        {tab === "tasks"    && <TasksTab redmineProjectId={project.redmine_project_id} />}
        {tab === "stats"    && <StatsTab redmineProjectId={project.redmine_project_id} />}
        {tab === "cvat"     && <CvatTab cvatLinks={project.cvat_links ?? []} />}
      </div>

      {showEdit && <ProjectFormModal project={project} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
