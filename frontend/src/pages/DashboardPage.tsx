import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database, HardDrive, Search, RefreshCw, GitBranch,
  Settings, AlertTriangle, Layers, BarChart2,
} from "lucide-react";
import { useDatasets, useStats } from "../hooks/useDatasets";
import { useProjects } from "../hooks/useConfig";
import { useProjectStats } from "../hooks/useProjectStats";
import { DatasetCard } from "../components/DatasetCard";
import { StatCard } from "../components/StatCard";
import { ProjectStatsView } from "../components/ProjectStatsView";
import { formatBytes } from "../utils";

type ViewMode = "datasets" | "statistics";

export function DashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("datasets");

  const { data: projects } = useProjects();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: datasets, isLoading, error, refetch, isFetching } = useDatasets(selectedProject, search);
  const {
    data: projectStats,
    isLoading: statsViewLoading,
    refetch: refetchStats,
    isFetching: isStatsRefetching,
  } = useProjectStats(selectedProject !== "all" ? selectedProject : null);

  const noProjects = projects !== undefined && projects.length === 0;
  const showProjectBadge = selectedProject === "all";
  const canShowStats = selectedProject !== "all";

  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    setViewMode("datasets");
    setSearch("");
  };

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
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Settings size={15} />
              Settings
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

        {/* View mode toggle — only when a specific project is selected */}
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
            {datasets && datasets.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-4">{datasets.length} dataset(s)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {datasets.map((ds) => (
                    <DatasetCard key={ds.id} dataset={ds} showProject={showProjectBadge} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
