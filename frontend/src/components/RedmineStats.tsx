import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Users, TrendingDown, AlertTriangle, CheckCircle, Loader2, ChevronDown, ChevronUp, Tag, Clock } from "lucide-react";
import { useRedmineStats, useRedmineMeta, useRedmineHours } from "../hooks/useRedmine";
import type { RedmineRef, RedmineMemberStat } from "../types";

// Màu cho từng thành viên trên chart
const MEMBER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

// ── Member selector ──────────────────────────────────────────────────────────

export function MemberSelector({
  members,
  selectedIds,
  onChange,
}: {
  members: RedmineRef[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const selectAll = () => onChange(members.map((m) => m.id));
  const clearAll = () => onChange([]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
      >
        <Users size={12} className="text-gray-400" />
        <span className="text-gray-700">
          {selectedIds.length === 0
            ? "Chọn thành viên"
            : selectedIds.length === members.length
            ? "Tất cả thành viên"
            : `${selectedIds.length} thành viên`}
        </span>
        {open ? <ChevronUp size={11} className="text-gray-400" /> : <ChevronDown size={11} className="text-gray-400" />}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[200px]">
          <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-gray-100">
            <span className="text-xs text-gray-400">Thành viên</span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-500 hover:underline">Tất cả</button>
              <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Bỏ chọn</button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {members.map((m, i) => (
              <label key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="rounded"
                />
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}
                />
                <span className="text-xs text-gray-700">{m.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tracker selector ─────────────────────────────────────────────────────────

function TrackerSelector({
  trackers,
  selectedIds,
  onChange,
}: {
  trackers: RedmineRef[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const allSelected = selectedIds.length === 0 || selectedIds.length === trackers.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
      >
        <Tag size={12} className="text-gray-400" />
        <span className="text-gray-700">
          {allSelected ? "Tất cả loại" : `${selectedIds.length} loại`}
        </span>
        {open ? <ChevronUp size={11} className="text-gray-400" /> : <ChevronDown size={11} className="text-gray-400" />}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[180px]">
          <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-gray-100">
            <span className="text-xs text-gray-400">Loại task</span>
            <button onClick={() => onChange([])} className="text-xs text-gray-400 hover:underline">
              Tất cả
            </button>
          </div>
          <div className="space-y-0.5">
            {trackers.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className="rounded"
                />
                <span className="text-xs text-gray-700">{t.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date range picker ────────────────────────────────────────────────────────

export function DateRangePicker({
  from, to, onChange,
}: {
  from: string; to: string;
  onChange: (from: string, to: string) => void;
}) {
  const presets = [
    { label: "7 ngày", days: 7 },
    { label: "30 ngày", days: 30 },
    { label: "90 ngày", days: 90 },
  ];

  const applyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    onChange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  };

  return (
    <div className="flex items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.days}
          onClick={() => applyPreset(p.days)}
          className="px-2.5 py-1 text-xs rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        >
          {p.label}
        </button>
      ))}
      <input
        type="date" value={from}
        onChange={(e) => onChange(e.target.value, to)}
        className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none"
      />
      <span className="text-xs text-gray-400">→</span>
      <input
        type="date" value={to}
        onChange={(e) => onChange(from, e.target.value)}
        className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none"
      />
    </div>
  );
}

// ── Stats table ──────────────────────────────────────────────────────────────

function StatRow({ stat, color }: { stat: RedmineMemberStat; color: string }) {
  const done = stat.total - stat.remaining;
  const doneRatio = stat.total > 0 ? Math.round((done / stat.total) * 100) : 0;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-gray-800">{stat.name}</span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-xl font-bold text-gray-800 tabular-nums">{stat.total}</span>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-xl font-bold tabular-nums" style={{ color }}>
          {stat.remaining}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${doneRatio}%`, backgroundColor: color, opacity: 0.7 }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums w-8 text-right">{doneRatio}%</span>
        </div>
      </td>
      {stat.overdue > 0 && (
        <td className="px-4 py-3.5 text-center">
          <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full font-medium">
            <AlertTriangle size={10} /> {stat.overdue} quá hạn
          </span>
        </td>
      )}
    </tr>
  );
}

// ── Working hours view ───────────────────────────────────────────────────────

function HoursView({
  data,
  isLoading,
  error,
  selectedMemberIds,
}: {
  data: import("../types").RedmineHoursResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedMemberIds: number[];
}) {
  const [mode, setMode] = useState<"actual" | "estimated">("actual");

  const getVal = (entry: { actual: number; estimated: number }) =>
    mode === "actual" ? entry.actual : entry.estimated;

  const getTotal = (m: import("../types").RedmineMemberHours) =>
    mode === "actual" ? m.total_actual : m.total_estimated;

  const memberColorMap: Record<number, string> = {};
  selectedMemberIds.forEach((id, i) => { memberColorMap[id] = MEMBER_COLORS[i % MEMBER_COLORS.length]; });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-300" /></div>;
  if (error) return <div className="text-xs text-red-500 py-4 text-center">{error.message}</div>;
  if (!data) return null;

  const chartData = data.months.map((month) => {
    const row: Record<string, string | number> = { month };
    data.members.forEach((m) => {
      const entry = m.monthly.find((e) => e.month === month);
      row[m.name] = entry ? getVal(entry) : 0;
    });
    return row;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode("actual")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${mode === "actual" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            Thực tế
          </button>
          <button
            onClick={() => setMode("estimated")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${mode === "estimated" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            Ước tính
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {mode === "actual" ? "Giờ đã log qua time entries" : "Giờ ước tính từ estimated_hours của issue"}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(data.members.length, 4)}, minmax(0,1fr))` }}>
        {data.members.map((m, i) => {
          const color = memberColorMap[m.id] ?? MEMBER_COLORS[i % MEMBER_COLORS.length];
          const actual = m.total_actual;
          const estimated = m.total_estimated;
          return (
            <div key={m.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <p className="text-xs text-gray-500 truncate">{m.name}</p>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Thực tế</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color }}>{actual}h</p>
                </div>
                <div className="pb-0.5">
                  <p className="text-xs text-gray-400 mb-0.5">Ước tính</p>
                  <p className="text-base font-semibold text-gray-400 tabular-nums">{estimated}h</p>
                </div>
                {estimated > 0 && (
                  <div className="pb-0.5 ml-auto">
                    <p className="text-xs text-gray-400 mb-0.5">Đạt</p>
                    <p className={`text-sm font-semibold tabular-nums ${actual >= estimated ? "text-green-600" : "text-orange-500"}`}>
                      {Math.round((actual / estimated) * 100)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-4 py-2.5 font-medium text-gray-400 uppercase tracking-wide">Tháng</th>
              {data.members.map((m, i) => (
                <th key={m.id} className="px-4 py-2.5 font-medium text-center" style={{ color: memberColorMap[m.id] ?? MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                  {m.name}
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium text-gray-400 uppercase tracking-wide text-center">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.months.map((month) => {
              const rowTotal = data.members.reduce((sum, m) => {
                const entry = m.monthly.find((e) => e.month === month);
                return sum + (entry ? getVal(entry) : 0);
              }, 0);
              return (
                <tr key={month} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-700">
                    {new Date(month + "-01").toLocaleDateString("vi-VN", { month: "long", year: "numeric" })}
                  </td>
                  {data.members.map((m) => {
                    const entry = m.monthly.find((e) => e.month === month);
                    const h = entry ? getVal(entry) : 0;
                    return (
                      <td key={m.id} className="px-4 py-2.5 text-center tabular-nums">
                        {h > 0 ? <span className="font-medium text-gray-800">{h}h</span> : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-center tabular-nums font-semibold text-gray-700">
                    {rowTotal > 0 ? `${Math.round(rowTotal * 100) / 100}h` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100 bg-gray-50/60 font-semibold">
              <td className="px-4 py-2.5 text-gray-600 text-xs uppercase tracking-wide">Tổng</td>
              {data.members.map((m, i) => (
                <td key={m.id} className="px-4 py-2.5 text-center tabular-nums" style={{ color: memberColorMap[m.id] ?? MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                  {getTotal(m)}h
                </td>
              ))}
              <td className="px-4 py-2.5 text-center tabular-nums text-gray-800">
                {Math.round(data.members.reduce((s, m) => s + getTotal(m), 0) * 100) / 100}h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bar chart */}
      {data.months.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-800 mb-4">
            Biểu đồ giờ {mode === "actual" ? "thực tế" : "ước tính"} theo tháng
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => new Date(v + "-01").toLocaleDateString("vi-VN", { month: "short", year: "2-digit" })}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} unit="h" />
              <Tooltip
                formatter={(value, name) => [`${value}h`, String(name)]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              {data.members.map((m, i) => {
                const color = memberColorMap[m.id] ?? MEMBER_COLORS[i % MEMBER_COLORS.length];
                return (
                  <Bar key={m.id} dataKey={m.name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={40}>
                    {data.months.map((_, mi) => <Cell key={mi} fill={color} fillOpacity={0.85} />)}
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RedmineStats({
  projectId,
  selectedMemberIds,
}: {
  projectId: string | undefined;
  members: RedmineRef[];
  selectedMemberIds: number[];
  onMemberSelectionChange: (ids: number[]) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(today);
  const [view, setView] = useState<"table" | "burndown" | "hours">("table");
  const [trackerIds, setTrackerIds] = useState<number[]>([]);

  const { data: meta } = useRedmineMeta();

  const { data, isLoading, error } = useRedmineStats({
    project_id: projectId,
    member_ids: selectedMemberIds,
    tracker_ids: trackerIds,
    from_date: fromDate,
    to_date: toDate,
  });

  const { data: hoursData, isLoading: hoursLoading, error: hoursError } = useRedmineHours({
    project_id: projectId,
    member_ids: selectedMemberIds,
    from_date: fromDate,
    to_date: toDate,
  });

  // Build aggregate burndown: 3 lines — Tổng / Còn lại / Đã xong
  const chartData = (() => {
    if (!data) return [];
    const byDate: Record<string, { date: string; total: number; remaining: number; done: number }> = {};
    data.days.forEach((d) => { byDate[d] = { date: d, total: 0, remaining: 0, done: 0 }; });
    data.members.forEach((m) => {
      m.burndown.forEach(({ date: d, total, remaining }) => {
        if (byDate[d]) {
          byDate[d].total += total;
          byDate[d].remaining += remaining;
          byDate[d].done += total - remaining;
        }
      });
    });
    return Object.values(byDate);
  })();

  const memberColorMap: Record<number, string> = {};
  selectedMemberIds.forEach((id, i) => {
    memberColorMap[id] = MEMBER_COLORS[i % MEMBER_COLORS.length];
  });

  // Sort by total desc for ranking
  const sortedMembers = data
    ? [...data.members].sort((a, b) => b.total - a.total)
    : [];

  const formatDateTick = (s: string) => {
    const d = new Date(s);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === "table" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            Bảng thống kê
          </button>
          <button
            onClick={() => setView("burndown")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === "burndown" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            <TrendingDown size={11} /> Burndown
          </button>
          <button
            onClick={() => setView("hours")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${view === "hours" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            <Clock size={11} /> Giờ làm
          </button>
        </div>
        <TrackerSelector
          trackers={meta?.trackers ?? []}
          selectedIds={trackerIds}
          onChange={setTrackerIds}
        />
        <DateRangePicker
          from={fromDate} to={toDate}
          onChange={(f, t) => { setFromDate(f); setToDate(t); }}
        />
      </div>

      {selectedMemberIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
          <Users size={28} className="text-gray-200" />
          <p className="text-sm">Chọn thành viên cần theo dõi ở thanh lọc phía trên</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-gray-300" />
        </div>
      ) : error ? (
        <div className="text-xs text-red-500 py-4 text-center">{error.message}</div>
      ) : view === "table" ? (
        /* ── Stats table ── */
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-2.5 font-medium w-1/3">Thành viên</th>
                <th className="px-4 py-2.5 font-medium text-center">Tổng số task</th>
                <th className="px-4 py-2.5 font-medium text-center">Task còn lại</th>
                <th className="px-4 py-2.5 font-medium">Tiến độ</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((stat, i) => (
                <StatRow
                  key={stat.id}
                  stat={stat}
                  color={memberColorMap[stat.id] ?? MEMBER_COLORS[i % MEMBER_COLORS.length]}
                />
              ))}
            </tbody>
          </table>
          {sortedMembers.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
              <CheckCircle size={16} className="text-gray-200" /> Không có dữ liệu
            </div>
          )}
        </div>
      ) : view === "burndown" ? (
        /* ── Burndown chart ── */
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Burndown chart</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Tổng hợp {data?.members.length ?? 0} thành viên được chọn
              </p>
            </div>
            <div className="flex gap-4">
              {[
                { key: "total",     label: "Tổng số task",     color: "#6b7280", dash: "5 3" },
                { key: "remaining", label: "Chưa thực hiện",   color: "#3b82f6", dash: ""    },
                { key: "done",      label: "Đã xong",           color: "#10b981", dash: ""    },
              ].map(({ key, label, color, dash }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <svg width="20" height="10">
                    <line x1="0" y1="5" x2="20" y2="5"
                      stroke={color} strokeWidth="2"
                      strokeDasharray={dash || undefined}
                    />
                  </svg>
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateTick}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
              />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(v) => new Date(v as string).toLocaleDateString("vi-VN")}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    total: "Tổng số task",
                    remaining: "Chưa thực hiện",
                    done: "Đã xong",
                  };
                  return [`${value} task`, labels[String(name)] ?? String(name)];
                }}
              />
              <Line
                type="monotone" dataKey="total"
                name="total"
                stroke="#6b7280" strokeWidth={2} strokeDasharray="5 3"
                dot={false} activeDot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="remaining"
                name="remaining"
                stroke="#3b82f6" strokeWidth={2.5}
                dot={false} activeDot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="done"
                name="done"
                stroke="#10b981" strokeWidth={2}
                dot={false} activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* ── Working hours view ── */
        <HoursView
          data={hoursData}
          isLoading={hoursLoading}
          error={hoursError}
          selectedMemberIds={selectedMemberIds}
        />
      )}
    </div>
  );
}
