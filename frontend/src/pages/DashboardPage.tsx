import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Database, HardDrive, Search, RefreshCw, GitBranch,
  Settings, AlertTriangle, Layers, BarChart2, FolderOpen,
  ChevronDown, ChevronRight, Loader2, Clock, FileStack, User,
  Terminal, Cloud, ServerCrash, PlusCircle, Users, LogOut, Bot,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useDatasets, useStats, useBranches, useRepoBranchDatasets, useGroupRepos } from "../hooks/useDatasets";
import { useProjects } from "../hooks/useConfig";
import { CreateDVCDatasetModal } from "../components/CreateDVCDatasetModal";
import { useDatasetDownloads } from "../hooks/useDatasetDownloads";
import { useProjectStats } from "../hooks/useProjectStats";
import { StatCard } from "../components/StatCard";
import { ProjectStatsView } from "../components/ProjectStatsView";
import { DownloadModal } from "../components/DownloadModal";
import { SSHDownloadModal } from "../components/SSHDownloadModal";
import { RcloneDownloadModal } from "../components/RcloneDownloadModal";
import { formatBytes, formatDate } from "../utils";
import type { Dataset } from "../types";

// ── Compact row for a single DVC dataset ─────────────────────────────────────

function DVCRow({ dataset, branch, showProject }: { dataset: Dataset; branch?: string; showProject?: boolean }) {
  const navigate = useNavigate();
  const [showDownload, setShowDownload] = useState(false);

  return (
    <>
      {showDownload && (
        <DownloadModal dataset={dataset} branch={branch} onClose={() => setShowDownload(false)} />
      )}
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 transition-colors cursor-pointer group border-b border-gray-100 last:border-0"
        onClick={() => navigate(`/datasets/${dataset.project_id}/${dataset.name}`)}
      >
        <Database size={13} className="text-blue-400 flex-shrink-0" />

        <span className="flex-1 text-sm font-medium text-gray-800 group-hover:text-blue-600 truncate min-w-0">
          {dataset.name}
        </span>

        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-xs text-gray-400">
          {showProject && dataset.project_name && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded text-xs font-medium flex-shrink-0">
              {dataset.project_name}
            </span>
          )}
          {dataset.size !== null && (
            <span className="w-16 text-right">{formatBytes(dataset.size)}</span>
          )}
          {dataset.nfiles !== null && dataset.nfiles !== undefined && (
            <span className="flex items-center gap-1 w-16">
              <FileStack size={11} /> {dataset.nfiles.toLocaleString()}
            </span>
          )}
          {dataset.last_author && (
            <span className="flex items-center gap-1 w-20 truncate">
              <User size={11} /> {dataset.last_author}
            </span>
          )}
          {dataset.last_modified && (
            <span className="flex items-center gap-1 w-16">
              <Clock size={11} /> {formatDate(dataset.last_modified)}
            </span>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setShowDownload(true); }}
          className="p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="DVC pull"
        >
          <Terminal size={13} />
        </button>

        <ChevronRight size={13} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
      </div>
    </>
  );
}

// ── Compact row for SSH dataset ───────────────────────────────────────────────

function SSHRow({ dataset }: { dataset: Dataset }) {
  const [showDownload, setShowDownload] = useState(false);
  const dlTasks = useDatasetDownloads(dataset.id);
  const isDownloading = dlTasks.length > 0;
  return (
    <>
      {showDownload && (
        <SSHDownloadModal dataset={dataset} onClose={() => setShowDownload(false)} />
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/50 transition-colors group border-b border-gray-100 last:border-0">
        <ServerCrash size={13} className="text-amber-500 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">{dataset.name}</span>
        <span className="hidden sm:block text-xs text-gray-400 font-mono truncate max-w-[200px]">{dataset.path}</span>
        {isDownloading && (
          <Loader2 size={13} className="text-amber-500 animate-spin flex-shrink-0" />
        )}
        <button
          onClick={() => setShowDownload(true)}
          className="p-1.5 rounded text-gray-300 hover:text-amber-600 hover:bg-amber-100 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Browse & download"
        >
          <FolderOpen size={13} />
        </button>
      </div>
    </>
  );
}

// ── Compact row for rclone/cloud dataset ──────────────────────────────────────

function RcloneRow({ dataset }: { dataset: Dataset }) {
  const [showDownload, setShowDownload] = useState(false);
  const dlTasks = useDatasetDownloads(dataset.id);
  const isDownloading = dlTasks.length > 0;
  return (
    <>
      {showDownload && (
        <RcloneDownloadModal dataset={dataset} onClose={() => setShowDownload(false)} />
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 transition-colors group border-b border-gray-100 last:border-0">
        <Cloud size={13} className="text-indigo-400 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">{dataset.name}</span>
        <span className="hidden sm:block text-xs text-gray-400 font-mono truncate max-w-[200px]">
          {dataset.rclone_remote}:{dataset.path}
        </span>
        {isDownloading && (
          <Loader2 size={13} className="text-indigo-400 animate-spin flex-shrink-0" />
        )}
        <button
          onClick={() => setShowDownload(true)}
          className="p-1.5 rounded text-gray-300 hover:text-indigo-600 hover:bg-indigo-100 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          title="Browse & download"
        >
          <FolderOpen size={13} />
        </button>
      </div>
    </>
  );
}

// ── Collapsible group containing DVC rows + optional SSH/rclone rows ──────────

function DatasetGroup({
  title, icon, accent, datasets, branch, showProjectBadge, defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "blue" | "amber" | "indigo" | "gray";
  datasets: Dataset[];
  branch?: string;
  showProjectBadge?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const borderColor = { blue: "border-blue-200", amber: "border-amber-200", indigo: "border-indigo-200", gray: "border-gray-200" }[accent];
  const headerBg   = { blue: "bg-blue-50",  amber: "bg-amber-50",  indigo: "bg-indigo-50",  gray: "bg-gray-50" }[accent];
  const iconColor  = { blue: "text-blue-500", amber: "text-amber-500", indigo: "text-indigo-500", gray: "text-gray-500" }[accent];

  return (
    <div className={`bg-white rounded-xl border ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-4 py-3 ${headerBg} border-b ${borderColor} hover:brightness-95 transition-all`}
      >
        <span className={iconColor}>{icon}</span>
        <span className="font-semibold text-sm text-gray-800 truncate flex-1 text-left">{title}</span>
        <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded-full flex-shrink-0">{datasets.length}</span>
        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div>
          {datasets.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No datasets</p>
          ) : (
            datasets.map((ds) =>
              ds.source_type === "ssh"    ? <SSHRow    key={ds.id} dataset={ds} /> :
              ds.source_type === "rclone" ? <RcloneRow key={ds.id} dataset={ds} /> :
              <DVCRow key={ds.id} dataset={ds} branch={branch} showProject={showProjectBadge} />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── DVC group: DVC → per-project sub-group → datasets ────────────────────────

function DVCProjectSubGroup({ title, datasets, branch }: { title: string; datasets: Dataset[]; branch?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50/70 hover:bg-blue-50/50 transition-colors border-b border-gray-100"
      >
        <FolderOpen size={12} className="text-blue-400 flex-shrink-0" />
        <span className="flex-1 text-xs font-semibold text-gray-600 text-left truncate">{title}</span>
        <span className="text-xs text-gray-400 mr-1">{datasets.length}</span>
        <ChevronDown size={12} className={`text-gray-300 flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && datasets.map((ds) => <DVCRow key={ds.id} dataset={ds} branch={branch} />)}
    </div>
  );
}

function DVCGroup({ datasets, branch, onCreateClick }: { datasets: Dataset[]; branch?: string; onCreateClick?: () => void }) {
  const [open, setOpen] = useState(true);

  const projectMap = new Map<string, Dataset[]>();
  for (const ds of datasets) {
    const key = ds.project_name;
    if (!projectMap.has(key)) projectMap.set(key, []);
    projectMap.get(key)!.push(ds);
  }
  const isMultiProject = projectMap.size > 1;

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:brightness-95 transition-all"
        >
          <GitBranch size={14} className="text-blue-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-800 flex-1 text-left">DVC</span>
          <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded-full flex-shrink-0">
            {datasets.length}
          </span>
          <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {onCreateClick && (
          <button
            onClick={onCreateClick}
            className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors font-medium flex-shrink-0 ml-1"
            title="Tạo dataset DVC mới"
          >
            <PlusCircle size={13} /> Tạo mới
          </button>
        )}
      </div>

      {open && (
        <div>
          {datasets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400 mb-3">Chưa có dataset DVC nào</p>
              {onCreateClick && (
                <button
                  onClick={onCreateClick}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors font-medium mx-auto border border-blue-200"
                >
                  <PlusCircle size={13} /> Tạo dataset đầu tiên
                </button>
              )}
            </div>
          ) : isMultiProject
            ? Array.from(projectMap.entries()).map(([projectName, pds]) => (
                <DVCProjectSubGroup key={projectName} title={projectName} datasets={pds} branch={branch} />
              ))
            : datasets.map((ds) => <DVCRow key={ds.id} dataset={ds} branch={branch} />)
          }
        </div>
      )}
    </div>
  );
}

// ── Per-repo section for group projects (with branch selector) ────────────────

function RepoDatasetSection({
  projectId, repoPath, displayName, initialDatasets,
}: {
  projectId: string; repoPath: string; displayName: string; initialDatasets: Dataset[];
}) {
  const [branch, setBranch] = useState("");
  const { data: branches, isLoading: branchesLoading } = useBranches(projectId, repoPath);
  const { data: branchDatasets, isLoading: fetchingBranch } = useRepoBranchDatasets(
    projectId, repoPath, branch,
  );
  const datasets = branch ? (branchDatasets ?? []) : initialDatasets;

  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-b border-blue-200">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 min-w-0">
          <FolderOpen size={14} className="text-blue-500 flex-shrink-0" />
          <span className="font-semibold text-sm text-gray-800 truncate">{displayName}</span>
          <span className="text-xs text-gray-400 bg-white/70 px-2 py-0.5 rounded-full flex-shrink-0">{datasets.length}</span>
          <ChevronDown size={13} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <div className="relative flex-shrink-0">
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={branchesLoading}
            className="appearance-none pl-2 pr-7 py-0.5 text-xs border border-blue-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-blue-400 disabled:opacity-50 cursor-pointer"
          >
            <option value="">HEAD</option>
            {branches?.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {fetchingBranch && <Loader2 size={12} className="animate-spin text-blue-500 flex-shrink-0" />}
      </div>

      {open && (
        <div>
          {datasets.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No datasets on this branch</p>
          ) : (
            datasets.map((ds) => <DVCRow key={ds.id} dataset={ds} branch={branch || undefined} />)
          )}
        </div>
      )}
    </div>
  );
}

type ViewMode = "datasets" | "statistics";

function groupByRepo(datasets: Dataset[]): Map<string, { name: string; datasets: Dataset[] }> {
  const map = new Map<string, { name: string; datasets: Dataset[] }>();
  for (const ds of datasets) {
    const key = ds.repo_path || ds.project_name;
    if (!map.has(key)) map.set(key, { name: ds.project_name, datasets: [] });
    map.get(key)!.datasets.push(ds);
  }
  return map;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("datasets");
  const [showCreateDataset, setShowCreateDataset] = useState(false);

  const queryClient = useQueryClient();
  const handleDatasetCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["datasets"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const { data: projects } = useProjects();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: branches, isLoading: branchesLoading } = useBranches(
    selectedProject !== "all" ? selectedProject : null
  );
  const { data: datasets, isLoading, error, refetch, isFetching } = useDatasets(selectedProject, search, selectedBranch);
  const {
    data: projectStats,
    isLoading: statsViewLoading,
    refetch: refetchStats,
    isFetching: isStatsRefetching,
  } = useProjectStats(selectedProject !== "all" ? selectedProject : null);

  const noProjects = projects !== undefined && projects.length === 0;
  const canShowStats = selectedProject !== "all";
  const selectedProjectData = projects?.find((p) => p.id === selectedProject);
  const isGroupProject = selectedProjectData?.source_type === "group";
  const { data: groupRepos } = useGroupRepos(isGroupProject ? selectedProject : null);

  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    setSelectedBranch("");
    setViewMode("datasets");
    setSearch("");
  };

  // Separate DVC from SSH/rclone for rendering
  const dvcDatasets   = datasets?.filter((d) => d.source_type === "dvc") ?? [];
  const sshDatasets   = datasets?.filter((d) => d.source_type === "ssh") ?? [];
  const cloudDatasets = datasets?.filter((d) => d.source_type === "rclone") ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Database size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg">DVC Data Dashboard</h1>
              {!statsLoading && stats && (
                <p className="text-xs text-gray-400">
                  {stats.total_projects} project(s) · {stats.total_datasets} datasets · {stats.minio_bucket}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => (viewMode === "statistics" ? refetchStats() : refetch())}
              disabled={isFetching || isStatsRefetching}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={isFetching || isStatsRefetching ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => setShowCreateDataset(true)}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors px-3 py-1.5 rounded-lg font-medium"
            >
              <PlusCircle size={15} />
              Tạo dataset
            </button>
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              <FolderOpen size={15} />
              Dự án
            </button>
            <button
              onClick={() => navigate("/redmine")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
            >
              <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
                <path fill="white" strokeWidth="2" d="M8 12h8M12 8v8" />
              </svg>
              Redmine
            </button>
            <button
              onClick={() => navigate("/cvat")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-violet-600 transition-colors"
            >
              <BarChart2 size={15} />
              CVAT
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Settings size={15} />
              Settings
            </button>

            <button
              onClick={() => navigate("/mcp")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              title="Kết nối MCP với Claude Desktop"
            >
              <Bot size={15} />
              MCP
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-200" />

            {/* Profile */}
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              title={user?.display_name || user?.username}
            >
              <User size={15} />
              {user?.display_name || user?.username || "Profile"}
            </button>

            {/* Users (admin only) */}
            {user?.role === "admin" && (
              <button
                onClick={() => navigate("/admin/users")}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-purple-600 transition-colors"
              >
                <Users size={15} />
                Users
              </button>
            )}

            {/* Logout */}
            <button
              onClick={async () => { await logout(); navigate("/login"); }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
              title="Đăng xuất"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {noProjects && (
          <div
            className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors"
            onClick={() => navigate("/settings")}
          >
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              No GitLab projects configured.{" "}
              <span className="underline font-medium">Go to Settings</span> to add a project.
            </p>
          </div>
        )}

        {!statsLoading && stats && selectedProject === "all" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <StatCard label="Total Datasets" value={stats.total_datasets} icon={<Database size={18} />} />
            <StatCard label="Total Size" value={formatBytes(stats.total_size_bytes)} icon={<HardDrive size={18} />} />
            <StatCard label="Projects" value={stats.total_projects} icon={<Layers size={18} />} />
          </div>
        )}

        {/* Project tabs */}
        {projects && projects.length > 0 && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            <button
              onClick={() => handleSelectProject("all")}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedProject === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
              }`}
            >
              <GitBranch size={13} />
              All Projects
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedProject === p.id
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Branch selector — single (non-group) project only */}
        {selectedProject !== "all" && !isGroupProject && (
          <div className="flex items-center gap-2 mb-5">
            <GitBranch size={14} className="text-gray-400 flex-shrink-0" />
            <div className="relative">
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={branchesLoading}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-50 cursor-pointer"
              >
                <option value="">
                  {branchesLoading ? "Loading branches…" : "Default branch (HEAD)"}
                </option>
                {branches?.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {selectedBranch && (
              <button onClick={() => setSelectedBranch("")} className="text-xs text-gray-400 hover:text-gray-600">
                Reset
              </button>
            )}
          </div>
        )}

        {/* View mode toggle */}
        {canShowStats && (
          <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
            <button
              onClick={() => setViewMode("datasets")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "datasets" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Database size={14} /> Datasets
            </button>
            <button
              onClick={() => setViewMode("statistics")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "statistics" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <BarChart2 size={14} /> Statistics
            </button>
          </div>
        )}

        {/* Statistics view */}
        {viewMode === "statistics" && canShowStats && (
          <>
            {statsViewLoading && (
              <div className="text-center py-16 text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                <p>Loading statistics…</p>
              </div>
            )}
            {projectStats && (
              <ProjectStatsView
                stats={projectStats}
                onRefresh={refetchStats}
                isRefreshing={isStatsRefetching}
              />
            )}
          </>
        )}

        {/* Datasets view */}
        {viewMode === "datasets" && (
          <>
            <div className="relative mb-6">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search datasets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
            </div>

            {isLoading && (
              <div className="text-center py-16 text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                <p>Loading datasets…</p>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                Failed to load datasets. Check your connection settings.
              </div>
            )}
            {datasets && datasets.length === 0 && !isLoading && !noProjects && (
              <div className="text-center py-16 text-gray-400">
                <Database size={32} className="mx-auto mb-3 opacity-40" />
                <p>No datasets found{search ? ` for "${search}"` : ""}.</p>
              </div>
            )}

            {datasets && datasets.length > 0 && (() => {
              // ── Group project: per-repo sections with branch selectors ──
              if (isGroupProject) {
                const repoMap = groupByRepo(dvcDatasets);
                const repoList: { path: string; name: string }[] = groupRepos
                  ?? Array.from(repoMap.keys()).map((key) => ({
                    path: key,
                    name: repoMap.get(key)?.name ?? key,
                  }));
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-400">{datasets.length} dataset(s)</p>

                    {/* SSH datasets */}
                    {sshDatasets.length > 0 && (
                      <DatasetGroup
                        title="SSH Storage"
                        icon={<ServerCrash size={14} />}
                        accent="amber"
                        datasets={sshDatasets}
                      />
                    )}

                    {/* Cloud/rclone datasets */}
                    {cloudDatasets.length > 0 && (
                      <DatasetGroup
                        title="Cloud Storage"
                        icon={<Cloud size={14} />}
                        accent="indigo"
                        datasets={cloudDatasets}
                      />
                    )}

                    {/* DVC datasets per repo */}
                    {repoList.length === 0 ? (
                      <div className="text-center py-16 text-gray-400">
                        <Database size={32} className="mx-auto mb-3 opacity-40" />
                        <p>No repositories found in this group.</p>
                      </div>
                    ) : (
                      repoList.map(({ path: repoPath, name }) => (
                        <RepoDatasetSection
                          key={repoPath}
                          projectId={selectedProject}
                          repoPath={repoPath}
                          displayName={name}
                          initialDatasets={repoMap.get(repoPath)?.datasets ?? []}
                        />
                      ))
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">{datasets.length} dataset(s)</p>

                  {/* SSH datasets */}
                  {sshDatasets.length > 0 && (
                    <DatasetGroup
                      title="SSH Storage"
                      icon={<ServerCrash size={14} />}
                      accent="amber"
                      datasets={sshDatasets}
                    />
                  )}

                  {/* Cloud/rclone datasets */}
                  {cloudDatasets.length > 0 && (
                    <DatasetGroup
                      title="Cloud Storage"
                      icon={<Cloud size={14} />}
                      accent="indigo"
                      datasets={cloudDatasets}
                    />
                  )}

                  {/* DVC datasets — DVC → project → dataset */}
                  {(dvcDatasets.length > 0 || (projects && projects.length > 0)) && (
                    <DVCGroup
                      datasets={dvcDatasets}
                      branch={selectedBranch || undefined}
                      onCreateClick={() => setShowCreateDataset(true)}
                    />
                  )}
                </div>
              );
            })()}
          </>
        )}
      </main>

      {showCreateDataset && (
        <CreateDVCDatasetModal
          onClose={() => setShowCreateDataset(false)}
          onCreated={handleDatasetCreated}
        />
      )}
    </div>
  );
}
