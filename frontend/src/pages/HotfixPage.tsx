import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, ExternalLink, CheckCircle2,
  AlertCircle, Loader2, Link, Clock, Zap, X,
  ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { useHotfixIssues } from "../hooks/useRedmine";
import type { RedmineIssue } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-700",
  "In Progress": "bg-yellow-100 text-yellow-700",
  "Resolved": "bg-green-100 text-green-700",
  "Feedback": "bg-purple-100 text-purple-700",
  "Closed": "bg-gray-100 text-gray-500",
  "Rejected": "bg-red-100 text-red-600",
  "QA Verified": "bg-emerald-100 text-emerald-700",
  "QA": "bg-teal-100 text-teal-700",
};

function statusBadge(name: string) {
  const cls = STATUS_COLORS[name] ?? "bg-gray-100 text-gray-600";
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`;
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getRedmineBaseUrl(queryUrl: string): string {
  try {
    const u = new URL(queryUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function issueUrl(baseUrl: string, issueId: number): string {
  return `${baseUrl}/issues/${issueId}`;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = "blue", icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: "blue" | "green" | "orange" | "gray";
  icon?: ReactNode;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <div className={`border rounded-xl p-4 flex flex-col gap-1 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-70">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}

// ── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({
  issue, baseUrl, highlight = false,
}: {
  issue: RedmineIssue;
  baseUrl: string;
  highlight?: boolean;
}) {
  const href = baseUrl ? issueUrl(baseUrl, issue.id) : undefined;
  return (
    <tr className={`border-b border-gray-100 text-sm transition-colors ${highlight ? "bg-emerald-50/60 hover:bg-emerald-50" : "hover:bg-gray-50"}`}>
      <td className="px-3 py-2.5 text-gray-400 tabular-nums font-mono text-xs whitespace-nowrap">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-1">
            #{issue.id} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100" />
          </a>
        ) : `#${issue.id}`}
      </td>
      <td className="px-3 py-2.5 max-w-sm">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-gray-800 hover:text-blue-600 line-clamp-1">
            {issue.subject}
          </a>
        ) : (
          <span className="text-gray-800 line-clamp-1">{issue.subject}</span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={statusBadge(issue.status.name)}>{issue.status.name}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
        {issue.assigned_to?.name ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
        {formatDate(issue.due_date)}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
        {formatTime(issue.updated_on)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${issue.done_ratio === 100 ? "bg-emerald-400" : "bg-blue-400"}`}
              style={{ width: `${issue.done_ratio}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{issue.done_ratio}%</span>
        </div>
      </td>
    </tr>
  );
}

// ── Section table ────────────────────────────────────────────────────────────

function IssueTable({
  issues, baseUrl, highlight = false,
}: {
  issues: RedmineIssue[];
  baseUrl: string;
  highlight?: boolean;
}) {
  if (issues.length === 0) return null;
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/80">
          <th className="px-3 py-2 font-medium">#</th>
          <th className="px-3 py-2 font-medium">Tiêu đề</th>
          <th className="px-3 py-2 font-medium">Trạng thái</th>
          <th className="px-3 py-2 font-medium">Assignee</th>
          <th className="px-3 py-2 font-medium">Due date</th>
          <th className="px-3 py-2 font-medium">Cập nhật lúc</th>
          <th className="px-3 py-2 font-medium">Tiến độ</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((issue) => (
          <IssueRow key={issue.id} issue={issue} baseUrl={baseUrl} highlight={highlight} />
        ))}
      </tbody>
    </table>
  );
}

// ── Countdown badge ──────────────────────────────────────────────────────────

function AutoRefreshBadge({ nextRefreshAt, onRefresh }: { nextRefreshAt: Date | null; onRefresh: () => void }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!nextRefreshAt) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((nextRefreshAt.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefreshAt]);

  if (!nextRefreshAt) return null;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <button
      onClick={onRefresh}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
      title="Làm mới ngay"
    >
      <Clock size={12} />
      {mins}:{String(secs).padStart(2, "0")}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function HotfixPage() {
  const navigate = useNavigate();

  const [inputUrl, setInputUrl] = useState(() => localStorage.getItem("hotfix_query_url") ?? "");
  const [qaStatus, setQaStatus] = useState(() => localStorage.getItem("hotfix_qa_status") ?? "QA Verified");
  const [activeUrl, setActiveUrl] = useState(() => localStorage.getItem("hotfix_query_url") ?? "");
  const [activeQaStatus, setActiveQaStatus] = useState(() => localStorage.getItem("hotfix_qa_status") ?? "QA Verified");
  const [showSettings, setShowSettings] = useState(!activeUrl);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  const [allCollapsed, setAllCollapsed] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useHotfixIssues(activeUrl, activeQaStatus);

  const handleLoad = useCallback(() => {
    if (!inputUrl.trim()) return;
    localStorage.setItem("hotfix_query_url", inputUrl.trim());
    localStorage.setItem("hotfix_qa_status", qaStatus.trim() || "QA Verified");
    setActiveUrl(inputUrl.trim());
    setActiveQaStatus(qaStatus.trim() || "QA Verified");
    setShowSettings(false);
  }, [inputUrl, qaStatus]);

  const handleManualRefresh = useCallback(() => {
    refetch();
    if (autoRefresh) setNextRefreshAt(new Date(Date.now() + 120_000));
  }, [refetch, autoRefresh]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (!autoRefresh || !activeUrl) {
      setNextRefreshAt(null);
      return;
    }
    setNextRefreshAt(new Date(Date.now() + 120_000));
    const id = setInterval(() => {
      refetch();
      setNextRefreshAt(new Date(Date.now() + 120_000));
    }, 120_000);
    return () => clearInterval(id);
  }, [autoRefresh, activeUrl, refetch]);

  const baseUrl = getRedmineBaseUrl(activeUrl);
  const todayStr = data?.today ?? new Date().toISOString().split("T")[0];
  const qaToday = data?.qa_verified_today ?? [];
  const allIssues = data?.all_issues ?? [];

  // Status distribution excluding QA verified today (to show in counters)
  const openCount = allIssues.filter((i) => !i.status.is_closed && !qaToday.find((q) => q.id === i.id)).length;

  const todayLabel = new Date(todayStr + "T00:00:00").toLocaleDateString("vi-VN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => navigate("/redmine")}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-orange-50 rounded-lg">
            <Zap size={14} className="text-orange-500" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">Sprint Hotfix</h1>
            {activeUrl && (
              <p className="text-xs text-gray-400 truncate max-w-[320px]">{activeUrl}</p>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Auto-refresh countdown */}
          <AutoRefreshBadge nextRefreshAt={nextRefreshAt} onRefresh={handleManualRefresh} />

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? "Tắt tự động làm mới" : "Bật tự động làm mới (2 phút)"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              autoRefresh
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Clock size={12} />
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>

          {/* Manual refresh */}
          <button
            onClick={handleManualRefresh}
            disabled={isFetching}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              showSettings ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Link size={12} />
            URL
          </button>

          {/* Open in Redmine */}
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <ExternalLink size={12} />
              Mở Redmine
            </a>
          )}
        </div>
      </div>

      {/* URL settings panel */}
      {showSettings && (
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-3xl flex flex-col gap-3">
            <p className="text-xs text-gray-500 font-medium">Nhập link sprint hotfix từ Redmine</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                placeholder="https://redmine.example.com/projects/my-project/issues?query_id=1323"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
              />
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={qaStatus}
                  onChange={(e) => setQaStatus(e.target.value)}
                  placeholder="QA Verified"
                  className="w-36 px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  title="Tên trạng thái QA Verified trong Redmine"
                />
              </div>
              <button
                onClick={handleLoad}
                disabled={!inputUrl.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <Zap size={13} />
                Tải sprint
              </button>
              {activeUrl && (
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Tên trạng thái QA Verified: <span className="font-mono bg-gray-100 px-1 rounded">{activeQaStatus}</span>
              {" · "}
              Hỗ trợ nhiều tên cách nhau bằng dấu phẩy
            </p>
          </div>
        </div>
      )}

      {/* No URL state */}
      {!activeUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400">
          <Zap size={40} className="text-orange-200" />
          <p className="text-sm font-medium text-gray-600">Nhập link sprint hotfix để bắt đầu</p>
          <p className="text-xs max-w-sm text-center">
            Ví dụ: <span className="font-mono text-gray-500">https://redmine.anybim.vn/projects/hawee-ai-ky-thuat/issues?query_id=1323</span>
          </p>
        </div>
      )}

      {/* Loading */}
      {activeUrl && isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Đang tải sprint...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {activeUrl && error && !isLoading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md bg-red-50 border border-red-100 rounded-xl p-5 text-center">
            <AlertCircle size={28} className="text-red-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-red-700 mb-1">Không thể tải dữ liệu</p>
            <p className="text-xs text-red-500">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {data && !isLoading && (
        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Date + summary */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Hôm nay</p>
                <p className="text-base font-semibold text-gray-800">{todayLabel}</p>
              </div>
              {isFetching && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 size={12} className="animate-spin" /> Đang làm mới...
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Tổng sprint"
                value={data.total}
                sub="issues"
                color="blue"
                icon={<Zap size={12} />}
              />
              <StatCard
                label="QA Verified hôm nay"
                value={qaToday.length}
                sub={`trạng thái: ${activeQaStatus}`}
                color="green"
                icon={<ShieldCheck size={12} />}
              />
              <StatCard
                label="Đang mở"
                value={openCount}
                sub="chưa hoàn thành"
                color="orange"
                icon={<Clock size={12} />}
              />
              <StatCard
                label="Đã đóng"
                value={allIssues.filter((i) => i.status.is_closed).length}
                sub="closed"
                color="gray"
                icon={<CheckCircle2 size={12} />}
              />
            </div>

            {/* Status breakdown */}
            {Object.keys(data.status_counts).length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Phân bổ theo trạng thái</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.status_counts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, count]) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className={statusBadge(name)}>{name}</span>
                        <span className="text-xs font-semibold text-gray-700">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* QA Verified today section */}
            <div className="bg-white border border-emerald-100 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  <h2 className="text-sm font-semibold text-emerald-800">
                    QA Verified hôm nay
                  </h2>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-bold">
                    {qaToday.length}
                  </span>
                </div>
              </div>

              {qaToday.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                  <CheckCircle2 size={28} className="text-gray-200" />
                  <p className="text-sm">Chưa có issue nào được QA Verified hôm nay</p>
                  <p className="text-xs text-gray-300">Trạng thái đang theo dõi: <span className="font-mono">{activeQaStatus}</span></p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <IssueTable issues={qaToday} baseUrl={baseUrl} highlight />
                </div>
              )}
            </div>

            {/* All sprint issues section */}
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <button
                className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                onClick={() => setAllCollapsed((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-orange-500" />
                  <h2 className="text-sm font-semibold text-gray-800">Tất cả issues trong sprint</h2>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-bold">
                    {allIssues.length}
                  </span>
                </div>
                {allCollapsed ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
              </button>

              {!allCollapsed && (
                allIssues.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <p className="text-sm">Không có issue nào trong sprint</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <IssueTable issues={allIssues} baseUrl={baseUrl} />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
