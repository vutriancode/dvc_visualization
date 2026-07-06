import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BarChart2, Loader2, AlertTriangle, CheckCircle,
  Users, Layers, TrendingUp, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useCVATProjects, useCVATStats } from "../hooks/useCVAT";
import type { CVATUserStat } from "../types";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#64748b",
];

function defaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 25);
  const to = new Date(now.getFullYear(), now.getMonth(), 25);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function CVATPage() {
  const navigate = useNavigate();
  const { from, to } = defaultDateRange();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  const { data: projects, isLoading: loadingProjects, error: projectsError } = useCVATProjects();
  const { data: stats, isLoading: loadingStats, error: statsError, refetch } = useCVATStats({
    project_id: projectId,
    from_date: fromDate,
    to_date: toDate,
    group_by: groupBy,
  });

  const chartData = useMemo(() => {
    if (!stats) return [];
    return stats.timeline.map((entry) => {
      const row: Record<string, string | number> = { period: entry.period };
      stats.users.forEach((u) => {
        row[u.display_name || u.username] = entry.users[String(u.id)] ?? 0;
      });
      return row;
    });
  }, [stats]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate("/")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
              <BarChart2 size={18} />
            </div>
            <h1 className="font-bold text-gray-900">CVAT Statistics</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
          {/* Project selector */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Dự án CVAT</label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Đang tải...
              </div>
            ) : projectsError ? (
              <p className="text-xs text-red-500">{(projectsError as Error).message}</p>
            ) : (
              <select
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
              >
                <option value="">-- Chọn dự án --</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Từ ngày</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Đến ngày</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100" />
          </div>

          {/* Group by */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nhóm theo</label>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(["day", "week", "month"] as const).map((g) => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${groupBy === g ? "bg-white text-violet-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {g === "day" ? "Ngày" : g === "week" ? "Tuần" : "Tháng"}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => refetch()}
            disabled={!projectId}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} />
            Tải lại
          </button>
        </div>

        {/* Loading / Error */}
        {loadingStats && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Đang tải thống kê...
          </div>
        )}
        {statsError && !loadingStats && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle size={15} /> {(statsError as Error).message}
          </div>
        )}

        {stats && (
          <>
            {/* Overall progress cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Tổng số jobs" value={stats.total_jobs} color="text-gray-900" />
              <StatCard
                label="Đã hoàn thành"
                value={stats.completed_jobs}
                sub={`${stats.progress_pct}%`}
                color="text-green-600"
              />
              <StatCard label="Tổng frames" value={stats.total_frames.toLocaleString()} />
              <StatCard
                label="Frames đã annotate"
                value={stats.completed_frames.toLocaleString()}
                sub={`${stats.total_frames ? Math.round(stats.completed_frames / stats.total_frames * 100) : 0}%`}
                color="text-violet-600"
              />
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Layers size={14} className="text-violet-500" /> Tiến độ dự án
                </span>
                <span className="text-sm font-bold text-violet-600">{stats.progress_pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-violet-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${stats.progress_pct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(stats.state_counts).map(([state, count]) => (
                  <span key={state} className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {state}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Per-user table */}
            {stats.users.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <Users size={14} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">Thống kê theo thành viên</span>
                  <span className="ml-auto text-xs text-gray-400">{fromDate} → {toDate}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="px-4 py-2 text-left">Thành viên</th>
                      <th className="px-4 py-2 text-right">Jobs hoàn thành</th>
                      <th className="px-4 py-2 text-right">Frames</th>
                      <th className="px-4 py-2 text-right">Frames/ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.users
                      .slice()
                      .sort((a: CVATUserStat, b: CVATUserStat) => b.frames_completed - a.frames_completed)
                      .map((u: CVATUserStat, i: number) => (
                        <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="font-medium text-gray-800">{u.display_name || u.username}</span>
                            {u.display_name && (
                              <span className="text-xs text-gray-400">@{u.username}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle size={12} /> {u.jobs_completed}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700 font-medium">
                            {u.frames_completed.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="inline-flex items-center gap-1 text-violet-600 font-medium">
                              <TrendingUp size={12} /> {u.frames_per_day}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Timeline chart */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <BarChart2 size={14} className="text-violet-500" />
                  Frames annotated theo {groupBy === "day" ? "ngày" : groupBy === "week" ? "tuần" : "tháng"}
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    {stats.users.map((u: CVATUserStat, i: number) => (
                      <Bar
                        key={u.id}
                        dataKey={u.display_name || u.username}
                        stackId="a"
                        fill={COLORS[i % COLORS.length]}
                        radius={i === stats.users.length - 1 ? [3, 3, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats.users.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-400">
                <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Không có dữ liệu trong khoảng thời gian này.</p>
                <p className="text-xs mt-1">Chỉ tính jobs ở trạng thái "completed" được cập nhật trong kỳ.</p>
              </div>
            )}
          </>
        )}

        {!projectId && !loadingStats && (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-gray-400">
            <Layers size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chọn một dự án CVAT để xem thống kê.</p>
          </div>
        )}
      </main>
    </div>
  );
}
