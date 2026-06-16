import { useNavigate } from "react-router-dom";
import { Database, GitCommit, HardDrive, User, Clock, RefreshCw, GitBranch, BarChart2, FileStack, Trophy } from "lucide-react";
import type { ProjectStats, DatasetStat, AuthorStat } from "../types";
import { formatBytes, formatDate } from "../utils";


function CountBar({ count, maxCount, color }: { count: number; maxCount: number; color: string }) {
  const pct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const RANK_STYLES = [
  { bg: "bg-yellow-50", border: "border-yellow-300", badge: "bg-yellow-400 text-white", label: "1st" },
  { bg: "bg-gray-50",   border: "border-gray-300",   badge: "bg-gray-400 text-white",   label: "2nd" },
  { bg: "bg-orange-50", border: "border-orange-300", badge: "bg-orange-400 text-white", label: "3rd" },
];

function TopContributors({ authors }: { authors: AuthorStat[] }) {
  if (authors.length === 0) return null;
  const top = authors.slice(0, 3);
  const maxCommits = top[0]?.commits ?? 1;
  const maxBytes = Math.max(...top.map(a => a.total_data_bytes), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <Trophy size={15} className="text-yellow-500" />
        <h2 className="text-sm font-semibold text-gray-700">Top Contributors</h2>
        <span className="text-xs text-gray-400 ml-1">by commits · last 50 commits/dataset</span>
      </div>

      {/* Top 3 podium cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
        {top.map((author, i) => {
          const s = RANK_STYLES[i];
          const commitPct = maxCommits > 0 ? (author.commits / maxCommits) * 100 : 0;
          const bytesPct  = maxBytes  > 0 ? (author.total_data_bytes / maxBytes) * 100 : 0;
          return (
            <div key={author.author} className={`rounded-xl border ${s.border} ${s.bg} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                <span className="font-semibold text-gray-900 text-sm truncate">{author.author}</span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="flex items-center gap-1"><GitCommit size={11} /> Commits</span>
                    <span className="font-semibold text-gray-800">{author.commits}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${commitPct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span className="flex items-center gap-1"><HardDrive size={11} /> Data (owned)</span>
                    <span className="font-semibold text-gray-800">{author.total_data_bytes > 0 ? formatBytes(author.total_data_bytes) : "—"}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${bytesPct}%` }} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Database size={11} />
                <span>{author.datasets_touched} dataset{author.datasets_touched !== 1 ? "s" : ""}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full leaderboard table if more than 3 authors */}
      {authors.length > 3 && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-2">#</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-2">Author</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">Commits</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">Datasets</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-2">Data Owned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {authors.slice(3).map((a, i) => (
                <tr key={a.author} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-2.5 text-xs text-gray-400">{i + 4}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <User size={12} className="text-gray-400" />{a.author}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-700">{a.commits}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500">{a.datasets_touched}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500">
                    {a.total_data_bytes > 0 ? formatBytes(a.total_data_bytes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Props {
  stats: ProjectStats;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function ProjectStatsView({ stats, onRefresh, isRefreshing }: Props) {
  const navigate = useNavigate();
  const maxSize = Math.max(...stats.datasets.map(d => d.size ?? 0), 1);
  const maxVersions = Math.max(...stats.datasets.map(d => d.version_count), 1);
  const maxFiles = Math.max(...stats.datasets.map(d => d.nfiles ?? 0), 1);

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Datasets"
          value={stats.total_datasets}
          icon={<Database size={17} />}
          color="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          label="Total Size"
          value={formatBytes(stats.total_size_bytes)}
          icon={<HardDrive size={17} />}
          color="bg-green-50 text-green-600"
        />
        <SummaryCard
          label="Total Files"
          value={stats.total_files.toLocaleString()}
          sub="across all datasets"
          icon={<FileStack size={17} />}
          color="bg-teal-50 text-teal-600"
        />
        <SummaryCard
          label="Total Versions"
          value={stats.total_versions}
          sub="across all datasets"
          icon={<GitCommit size={17} />}
          color="bg-purple-50 text-purple-600"
        />
        <SummaryCard
          label="Avg Versions"
          value={stats.total_datasets > 0
            ? (stats.total_versions / stats.total_datasets).toFixed(1)
            : "—"}
          sub="per dataset"
          icon={<BarChart2 size={17} />}
          color="bg-orange-50 text-orange-500"
        />
      </div>

      {/* Three charts side by side (or stacked on mobile) */}
      {stats.datasets.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Size distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Size</h2>
              <span className="text-xs text-gray-400">sorted by size</span>
            </div>
            <div className="space-y-3">
              {stats.datasets.map((d) => (
                <div key={d.name} className="flex items-center gap-2 group">
                  <button
                    onClick={() => navigate(`/datasets/${stats.project_id}/${d.name}`)}
                    className="w-28 text-right text-xs font-medium text-gray-700 group-hover:text-blue-600 truncate transition-colors flex-shrink-0"
                  >
                    {d.name}
                  </button>
                  <div className="flex-1">
                    <CountBar count={d.size ?? 0} maxCount={maxSize} color="bg-blue-500" />
                  </div>
                  <span className="w-16 text-xs text-gray-500 text-right flex-shrink-0">
                    {d.size !== null ? formatBytes(d.size) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* File count */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">File Count</h2>
              <span className="text-xs text-gray-400">files per dataset</span>
            </div>
            <div className="space-y-3">
              {[...stats.datasets]
                .sort((a, b) => (b.nfiles ?? 0) - (a.nfiles ?? 0))
                .map((d) => (
                  <div key={d.name} className="flex items-center gap-2 group">
                    <button
                      onClick={() => navigate(`/datasets/${stats.project_id}/${d.name}`)}
                      className="w-28 text-right text-xs font-medium text-gray-700 group-hover:text-blue-600 truncate transition-colors flex-shrink-0"
                    >
                      {d.name}
                    </button>
                    <div className="flex-1">
                      <CountBar count={d.nfiles ?? 0} maxCount={maxFiles} color="bg-teal-500" />
                    </div>
                    <span className="w-16 text-xs text-gray-500 text-right flex-shrink-0">
                      {d.nfiles !== null && d.nfiles !== undefined
                        ? `${d.nfiles.toLocaleString()} f`
                        : "—"}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Version count */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Versions</h2>
              <span className="text-xs text-gray-400">commits per dataset</span>
            </div>
            <div className="space-y-3">
              {[...stats.datasets]
                .sort((a, b) => b.version_count - a.version_count)
                .map((d) => (
                  <div key={d.name} className="flex items-center gap-2 group">
                    <button
                      onClick={() => navigate(`/datasets/${stats.project_id}/${d.name}`)}
                      className="w-28 text-right text-xs font-medium text-gray-700 group-hover:text-blue-600 truncate transition-colors flex-shrink-0"
                    >
                      {d.name}
                    </button>
                    <div className="flex-1">
                      <CountBar count={d.version_count} maxCount={maxVersions} color="bg-purple-400" />
                    </div>
                    <span className="w-16 text-xs text-gray-500 text-right flex-shrink-0">
                      {d.version_count} v
                    </span>
                  </div>
                ))}
            </div>
          </div>

        </div>
      )}

      {/* Top Contributors */}
      <TopContributors authors={stats.author_stats ?? []} />

      {/* Detailed table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Dataset Details</h2>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Dataset</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Size</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Files</th>
                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Versions</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Last Author</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Last Modified</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Last Commit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.datasets.map((d: DatasetStat) => (
                <tr
                  key={d.name}
                  onClick={() => navigate(`/datasets/${stats.project_id}/${d.name}`)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <div>
                      <span className="font-medium text-gray-900">{d.name}</span>
                      <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-xs">{d.path}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium whitespace-nowrap">
                    {d.size !== null ? formatBytes(d.size) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {d.nfiles !== null && d.nfiles !== undefined
                      ? <span className="inline-flex items-center gap-1 text-teal-600 font-medium">
                          <FileStack size={11} />{d.nfiles.toLocaleString()}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-purple-600 font-medium">
                      <GitBranch size={11} />
                      {d.version_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {d.last_author
                      ? <span className="flex items-center gap-1"><User size={11} className="text-gray-400" />{d.last_author}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {d.last_modified
                      ? <span className="flex items-center gap-1"><Clock size={11} className="text-gray-400" />{formatDate(d.last_modified)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs">
                    <p className="text-xs truncate">{d.last_commit_message ?? "—"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
