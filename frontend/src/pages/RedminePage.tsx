import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Settings, Plus, RefreshCw, Filter, X,
  AlertCircle, Loader2,
  CheckCircle, Tag, Flag, Edit2, Trash2,
  MessageSquare, BarChart2, List, Download, Zap, Clock,
} from "lucide-react";
import {
  useRedmineProjects, useRedmineIssues, useRedmineIssue,
  useRedmineMeta, useRedmineMembers, useAllRedmineMembers,
  useCreateIssue, useUpdateIssue, useDeleteIssue,
  useRedmineStatusMapping, useExportTimeEntries, useExportOTReport,
  useLogTime, useTimeActivities, useLoggedIssueIds,
} from "../hooks/useRedmine";
import { RedmineStats, MemberSelector } from "../components/RedmineStats";
import type { RedmineIssue, RedmineRef, RedmineMeta } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  Low: "text-gray-400",
  Normal: "text-blue-500",
  High: "text-orange-500",
  Urgent: "text-red-500",
  Immediate: "text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-700",
  "In Progress": "bg-yellow-100 text-yellow-700",
  "Resolved": "bg-green-100 text-green-700",
  "Feedback": "bg-purple-100 text-purple-700",
  "Closed": "bg-gray-100 text-gray-500",
  "Rejected": "bg-red-100 text-red-600",
};

function statusBadge(name: string) {
  const cls = STATUS_COLORS[name] ?? "bg-gray-100 text-gray-600";
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`;
}

function priorityIcon(name: string) {
  const cls = PRIORITY_COLORS[name] ?? "text-gray-400";
  return <Flag size={11} className={cls} />;
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

// ── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  onSelect,
  selected,
  isDoneNoTime,
}: {
  issue: RedmineIssue;
  onSelect: (id: number) => void;
  selected: boolean;
  isDoneNoTime: boolean;
}) {
  return (
    <tr
      onClick={() => onSelect(issue.id)}
      className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50/40 transition-colors text-sm ${selected ? "bg-blue-50" : isDoneNoTime ? "bg-amber-50/60" : ""}`}
    >
      <td className="px-3 py-2.5 text-gray-400 tabular-nums font-mono text-xs whitespace-nowrap">
        #{issue.id}
      </td>
      <td className="px-3 py-2.5 max-w-xs">
        <div className="flex items-center gap-1.5">
          {isDoneNoTime && (
            <span title="Task đã xong nhưng chưa log thời gian">
              <Clock size={12} className="text-amber-500 flex-shrink-0" />
            </span>
          )}
          <span className="text-gray-800 line-clamp-1">{issue.subject}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={statusBadge(issue.status.name)}>{issue.status.name}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{issue.tracker.name}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1 text-xs text-gray-600">
          {priorityIcon(issue.priority.name)} {issue.priority.name}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
        {issue.assigned_to?.name ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(issue.due_date)}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${issue.done_ratio}%` }} />
          </div>
          <span className="text-xs text-gray-400">{issue.done_ratio}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {issue.spent_hours != null ? (
          <span className={`${issue.spent_hours === 0 ? "text-gray-300" : "text-gray-500"}`}>
            {issue.spent_hours}h
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Issue detail panel ───────────────────────────────────────────────────────

function IssuePanel({
  issueId,
  meta,
  members,
  onClose,
  onDeleted,
}: {
  issueId: number;
  meta: RedmineMeta | undefined;
  members: RedmineRef[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { data: issue, isLoading } = useRedmineIssue(issueId);
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const logTime = useLogTime();
  const { data: activities = [] } = useTimeActivities();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLogTime, setShowLogTime] = useState(false);
  const [logForm, setLogForm] = useState({
    hours: "",
    spent_on: new Date().toISOString().split("T")[0],
    activity_id: "",
    comments: "",
  });

  const handleLogTime = async () => {
    if (!logForm.hours || Number(logForm.hours) <= 0) return;
    await logTime.mutateAsync({
      issue_id: issueId,
      hours: Number(logForm.hours),
      spent_on: logForm.spent_on,
      activity_id: logForm.activity_id ? Number(logForm.activity_id) : undefined,
      comments: logForm.comments,
    });
    setShowLogTime(false);
    setLogForm({ hours: "", spent_on: new Date().toISOString().split("T")[0], activity_id: "", comments: "" });
  };

  const startEdit = () => {
    if (!issue) return;
    setForm({
      subject: issue.subject,
      description: issue.description ?? "",
      status_id: issue.status.id,
      priority_id: issue.priority.id,
      tracker_id: issue.tracker.id,
      assigned_to_id: issue.assigned_to?.id ?? null,
      done_ratio: issue.done_ratio,
      due_date: issue.due_date ?? "",
      estimated_hours: issue.estimated_hours ?? null,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    // Bỏ qua chuỗi rỗng (empty string không hợp lệ với Optional[float/int])
    const payload: Record<string, unknown> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== "") payload[k] = v;
    });
    if (note.trim()) payload.notes = note.trim();
    await updateIssue.mutateAsync({ id: issueId, data: payload });
    setEditing(false);
    setNote("");
  };

  const handleDelete = async () => {
    await deleteIssue.mutateAsync(issueId);
    onDeleted();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={20} className="animate-spin text-gray-300" />
      </div>
    );
  }

  if (!issue) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span className="text-xs text-gray-400 font-mono">#{issue.id}</span>
        <div className="flex items-center gap-1">
          {!editing && (
            <>
              <button
                onClick={() => { setShowLogTime((v) => !v); setEditing(false); }}
                title="Log thời gian"
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showLogTime ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100 text-gray-400 hover:text-gray-700"}`}
              >
                <Clock size={12} /> Log time
              </button>
              <button onClick={startEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <Edit2 size={13} />
              </button>
            </>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Log time form */}
        {showLogTime && !editing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2.5">
            <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
              <Clock size={12} /> Log thời gian
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 mb-0.5 block">Số giờ *</label>
                <input
                  type="number"
                  min={0.25} step={0.25}
                  value={logForm.hours}
                  onChange={(e) => setLogForm({ ...logForm, hours: e.target.value })}
                  placeholder="0.5"
                  autoFocus
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-0.5 block">Ngày</label>
                <input
                  type="date"
                  value={logForm.spent_on}
                  onChange={(e) => setLogForm({ ...logForm, spent_on: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            {activities.length > 0 && (
              <div>
                <label className="text-xs text-gray-600 mb-0.5 block">Loại công việc</label>
                <select
                  value={logForm.activity_id}
                  onChange={(e) => setLogForm({ ...logForm, activity_id: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                >
                  <option value="">— Chọn loại —</option>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 mb-0.5 block">Ghi chú</label>
              <input
                type="text"
                value={logForm.comments}
                onChange={(e) => setLogForm({ ...logForm, comments: e.target.value })}
                placeholder="Mô tả công việc..."
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            {logTime.isError && (
              <p className="text-xs text-red-600">{logTime.error.message}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleLogTime}
                disabled={!logForm.hours || Number(logForm.hours) <= 0 || logTime.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {logTime.isPending ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />}
                Lưu
              </button>
              <button
                onClick={() => setShowLogTime(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
            <p className="text-red-700 font-medium mb-2">Xóa issue này?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
              >
                {deleteIssue.isPending ? <Loader2 size={11} className="animate-spin" /> : "Xóa"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                Hủy
              </button>
            </div>
          </div>
        )}

        {editing ? (
          /* ── Edit form ── */
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tiêu đề</label>
              <input
                type="text"
                value={String(form.subject ?? "")}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Trạng thái</label>
                <select
                  value={Number(form.status_id)}
                  onChange={(e) => setForm({ ...form, status_id: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                >
                  {meta?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Độ ưu tiên</label>
                <select
                  value={Number(form.priority_id)}
                  onChange={(e) => setForm({ ...form, priority_id: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                >
                  {meta?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Tracker</label>
                <select
                  value={Number(form.tracker_id)}
                  onChange={(e) => setForm({ ...form, tracker_id: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                >
                  {meta?.trackers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Assignee</label>
                <select
                  value={Number(form.assigned_to_id) || ""}
                  onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                >
                  <option value="">— Chưa giao —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Due date</label>
                <input
                  type="date"
                  value={String(form.due_date ?? "")}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value || null })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Tiến độ (%)</label>
                <input
                  type="number"
                  min={0} max={100} step={10}
                  value={Number(form.done_ratio ?? 0)}
                  onChange={(e) => setForm({ ...form, done_ratio: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Mô tả</label>
              <textarea
                value={String(form.description ?? "")}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Ghi chú (comment)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Thêm ghi chú..."
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={updateIssue.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {updateIssue.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                Lưu
              </button>
              <button
                onClick={() => { setEditing(false); setNote(""); }}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            <h3 className="font-semibold text-gray-900 text-sm leading-snug">{issue.subject}</h3>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-1.5">
              <span className={statusBadge(issue.status.name)}>{issue.status.name}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                <Tag size={10} /> {issue.tracker.name}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                {priorityIcon(issue.priority.name)} {issue.priority.name}
              </span>
            </div>

            {/* Fields */}
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Người tạo</span>
                <span>{issue.author.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Assignee</span>
                <span>{issue.assigned_to?.name ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Due date</span>
                <span>{formatDate(issue.due_date)}</span>
              </div>
              {issue.estimated_hours != null && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Ước tính</span>
                  <span>{issue.estimated_hours}h</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Đã log</span>
                {issue.spent_hours != null ? (
                  <span className={`flex items-center gap-1 ${issue.spent_hours === 0 ? "text-amber-500 font-medium" : "text-gray-600"}`}>
                    {issue.spent_hours === 0 && <Clock size={11} />}
                    {issue.spent_hours}h
                    {issue.spent_hours === 0 && <span className="text-xs">(chưa log)</span>}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Tiến độ</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${issue.done_ratio}%` }} />
                  </div>
                  <span>{issue.done_ratio}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Cập nhật</span>
                <span>{formatDate(issue.updated_on)}</span>
              </div>
            </div>

            {/* Description */}
            {issue.description && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Mô tả</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 leading-relaxed">
                  {issue.description}
                </p>
              </div>
            )}

            {/* Journals */}
            {issue.journals && issue.journals.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                  <MessageSquare size={11} /> Lịch sử ({issue.journals.length})
                </p>
                <div className="space-y-2">
                  {issue.journals.filter((j) => j.notes).map((j) => (
                    <div key={j.id} className="bg-gray-50 rounded p-2 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-700">{j.user.name}</span>
                        <span className="text-gray-400">{formatDate(j.created_on)}</span>
                      </div>
                      <p className="text-gray-600 whitespace-pre-wrap">{j.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Create issue modal ────────────────────────────────────────────────────────

function CreateIssueModal({
  projectId,
  meta,
  members,
  onClose,
}: {
  projectId: string;
  meta: RedmineMeta | undefined;
  members: RedmineRef[];
  onClose: () => void;
}) {
  const createIssue = useCreateIssue();
  const [form, setForm] = useState<Record<string, unknown>>({
    subject: "",
    description: "",
    tracker_id: meta?.trackers[0]?.id ?? null,
    priority_id: meta?.priorities.find((p) => p.name === "Normal")?.id ?? meta?.priorities[0]?.id ?? null,
    status_id: meta?.statuses[0]?.id ?? null,
    assigned_to_id: null,
    due_date: "",
    estimated_hours: "",
  });

  const handleSubmit = async () => {
    if (!form.subject) return;
    const payload: Record<string, unknown> = {
      project_id: projectId,
      subject: form.subject,
    };
    if (form.description) payload.description = form.description;
    if (form.tracker_id) payload.tracker_id = form.tracker_id;
    if (form.status_id) payload.status_id = form.status_id;
    if (form.priority_id) payload.priority_id = form.priority_id;
    if (form.assigned_to_id) payload.assigned_to_id = form.assigned_to_id;
    if (form.due_date) payload.due_date = form.due_date;
    if (form.estimated_hours) payload.estimated_hours = Number(form.estimated_hours);
    await createIssue.mutateAsync(payload);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Tạo issue mới</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Tiêu đề *</label>
            <input
              type="text"
              autoFocus
              value={String(form.subject ?? "")}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Nhập tiêu đề issue..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Tracker</label>
              <select
                value={Number(form.tracker_id) || ""}
                onChange={(e) => setForm({ ...form, tracker_id: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              >
                {meta?.trackers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Độ ưu tiên</label>
              <select
                value={Number(form.priority_id) || ""}
                onChange={(e) => setForm({ ...form, priority_id: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              >
                {meta?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Trạng thái</label>
              <select
                value={Number(form.status_id) || ""}
                onChange={(e) => setForm({ ...form, status_id: Number(e.target.value) })}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              >
                {meta?.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Assignee</label>
              <select
                value={Number(form.assigned_to_id) || ""}
                onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              >
                <option value="">— Chưa giao —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Due date</label>
              <input
                type="date"
                value={String(form.due_date ?? "")}
                onChange={(e) => setForm({ ...form, due_date: e.target.value || null })}
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Ước tính (giờ)</label>
              <input
                type="number"
                min={0} step={0.5}
                value={String(form.estimated_hours ?? "")}
                onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                placeholder="0"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mô tả</label>
            <textarea
              value={String(form.description ?? "")}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Mô tả chi tiết..."
              className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.subject || createIssue.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {createIssue.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Tạo issue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export modal ─────────────────────────────────────────────────────────────

function CheckboxList<T extends { id: number | string; name: string }>({
  label,
  items,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  emptyText,
}: {
  label: string;
  items: T[];
  selectedIds: (number | string)[];
  onToggle: (id: number | string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  emptyText?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-600">
          {label} <span className="text-gray-400 font-normal">({selectedIds.length} đã chọn)</span>
        </label>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={onSelectAll} className="text-xs text-blue-600 hover:text-blue-700">Chọn tất cả</button>
            <span className="text-gray-300 text-xs">·</span>
            <button onClick={onClearAll} className="text-xs text-gray-400 hover:text-gray-600">Bỏ chọn</button>
          </div>
        )}
      </div>
      <div className="border border-gray-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-gray-50">
        {items.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-400 text-center">{emptyText ?? "Đang tải..."}</p>
        ) : (
          items.map((item) => (
            <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => onToggle(item.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{item.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function ExportModal({
  initialProjectId,
  onClose,
}: {
  initialProjectId: string;
  onClose: () => void;
}) {
  const [reportType, setReportType] = useState<"logtime" | "ot">("logtime");
  const logTimeMutation = useExportTimeEntries();
  const otMutation = useExportOTReport();
  const exportMutation = reportType === "ot" ? otMutation : logTimeMutation;

  const { data: projects = [] } = useRedmineProjects();
  const { data: allMembers = [] } = useAllRedmineMembers(true);

  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = today.slice(0, 8) + "01";

  const [selProjectIds, setSelProjectIds] = useState<string[]>(
    initialProjectId ? [initialProjectId] : []
  );
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [selMemberIds, setSelMemberIds] = useState<number[]>([]);

  const projectItems = projects.map((p) => ({
    id: p.identifier || String(p.id),
    name: p.name,
  }));

  const toggleProject = (id: string | number) => {
    const sid = String(id);
    setSelProjectIds((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);
  };

  const toggleMember = (id: string | number) => {
    const nid = Number(id);
    setSelMemberIds((prev) => prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]);
  };

  const handleExport = async () => {
    if (!selMemberIds.length) return;
    await exportMutation.mutateAsync({
      project_ids: selProjectIds,
      user_ids: selMemberIds,
      from_date: fromDate,
      to_date: toDate,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-50 rounded-lg">
              <Download size={14} className="text-green-600" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">Xuất báo cáo Excel</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Report type toggle */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Loại báo cáo</label>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button
                onClick={() => setReportType("logtime")}
                className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${reportType === "logtime" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
              >
                Log Time
              </button>
              <button
                onClick={() => setReportType("ot")}
                className={`px-4 py-1.5 text-xs rounded-md font-medium transition-colors ${reportType === "ot" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
              >
                Báo cáo OT
              </button>
            </div>
            {reportType === "ot" && (
              <p className="text-xs text-gray-400 mt-1.5">
                Chỉ xuất time entries thuộc task có subject bắt đầu bằng <span className="font-mono bg-gray-100 px-1 rounded">[OT]</span>
              </p>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Từ ngày</label>
              <input
                type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Đến ngày</label>
              <input
                type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Projects */}
          <CheckboxList
            label="Dự án"
            items={projectItems}
            selectedIds={selProjectIds}
            onToggle={toggleProject}
            onSelectAll={() => setSelProjectIds(projectItems.map((p) => String(p.id)))}
            onClearAll={() => setSelProjectIds([])}
            emptyText="Đang tải dự án..."
          />

          {/* Members */}
          <CheckboxList
            label="Thành viên"
            items={allMembers.map((m) => ({ id: m.id, name: m.name }))}
            selectedIds={selMemberIds}
            onToggle={toggleMember}
            onSelectAll={() => setSelMemberIds(allMembers.map((m) => m.id))}
            onClearAll={() => setSelMemberIds([])}
            emptyText="Đang tải thành viên..."
          />

          {exportMutation.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {exportMutation.error.message}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            {selProjectIds.length === 0
              ? "Tất cả dự án"
              : `${selProjectIds.length} dự án`}
            {" · "}
            {selMemberIds.length === 0 ? "chưa chọn thành viên" : `${selMemberIds.length} thành viên`}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Hủy
            </button>
            <button
              onClick={handleExport}
              disabled={!selMemberIds.length || exportMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {exportMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exportMutation.isPending ? "Đang xuất..." : reportType === "ot" ? "Xuất OT" : "Xuất Log Time"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 12 : m;
  const from = `${prevY}-${String(prevM).padStart(2, "0")}-25`;
  const to = `${y}-${String(m + 1).padStart(2, "0")}-25`;
  return { from, to };
}

// ── Main page ────────────────────────────────────────────────────────────────

export function RedminePage() {
  const navigate = useNavigate();

  const [{ from: defaultFrom, to: defaultTo }] = useState(defaultDateRange);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [pageView, setPageView] = useState<"issues" | "stats">("issues");
  const [statusCategoryFilter, setStatusCategoryFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");
  const [trackerFilter, setTrackerFilter] = useState<number | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<number | undefined>();
  const [noSpendTimeFilter, setNoSpendTimeFilter] = useState(false);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [trackedMemberIds, setTrackedMemberIds] = useState<number[]>([]);

  const { data: projects, isLoading: loadingProjects, error: projectsError } = useRedmineProjects();
  const { data: meta } = useRedmineMeta();
  const { data: statusMapping = {} } = useRedmineStatusMapping();

  // Members: project cụ thể hoặc tất cả (endpoint /members/all)
  const { data: singleProjectMembers = [] } = useRedmineMembers(selectedProjectId || null);
  const { data: allMembers = [] } = useAllRedmineMembers(!selectedProjectId);
  const members = selectedProjectId ? singleProjectMembers : allMembers;

  // Xác định category của 1 issue dựa vào status mapping
  const getIssueCategory = (issue: { status: { id: number; is_closed: boolean } }) => {
    const sid = String(issue.status.id);
    if (statusMapping[sid]) return statusMapping[sid];
    return issue.status.is_closed ? "done" : "todo";
  };

  const { data: issuesData, isLoading: loadingIssues, refetch } = useRedmineIssues({
    project_id: selectedProjectId || undefined,
    // Luôn fetch tất cả status, filter client-side bằng mapping
    status_id: "*",
    tracker_id: trackerFilter,
    priority_id: priorityFilter,
    // Nếu chọn đúng 1 member thì lọc ngay từ API cho hiệu quả
    assigned_to_id: trackedMemberIds.length === 1 ? trackedMemberIds[0] : undefined,
  });

  const allIssues = issuesData?.issues ?? [];

  // Lấy tất cả member IDs để fetch time entries (per-member = không cần admin permission)
  // Đợi members load xong (allMemberIds.length > 0) mới gọi hook
  const allMemberIds = useMemo(() => members.map((m) => m.id), [members]);

  const { data: loggedIds = [], isLoading: loadingLoggedIds } = useLoggedIssueIds({
    project_id: selectedProjectId || undefined,
    from_date: fromDate,
    to_date: toDate,
    member_ids: allMemberIds,
  });

  const loggedIdSet = useMemo(() => new Set(loggedIds), [loggedIds]);

  // "Chưa log time" = không có time entry trong kỳ
  // Trong khi đang load → không đánh dấu (tránh false positive)
  const isNoLogTime = (issue: RedmineIssue): boolean => {
    if (loadingLoggedIds) return false;
    return !loggedIdSet.has(issue.id);
  };

  // Issues done nhưng chưa log time trong kỳ (dùng để hiển thị banner cảnh báo)
  const doneNoTimeIssues = allIssues.filter((issue) => {
    if (getIssueCategory(issue) !== "done") return false;
    if (trackedMemberIds.length > 1 && (!issue.assigned_to || !trackedMemberIds.includes(issue.assigned_to.id))) return false;
    return isNoLogTime(issue);
  });

  // Client-side filter: status category + multi-member + no spend time
  const issues = allIssues.filter((issue) => {
    if (statusCategoryFilter !== "all" && getIssueCategory(issue) !== statusCategoryFilter) return false;
    if (trackedMemberIds.length > 1 && (!issue.assigned_to || !trackedMemberIds.includes(issue.assigned_to.id))) return false;
    if (noSpendTimeFilter) {
      if (getIssueCategory(issue) !== "done") return false;
      if (!isNoLogTime(issue)) return false;
    }
    return true;
  });

  const totalCount = issues.length;

  // Not configured state
  if (projectsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <AlertCircle size={36} className="text-red-300" />
        <p className="text-gray-600 text-sm">Không thể kết nối Redmine</p>
        <p className="text-xs text-gray-400 max-w-sm text-center">{projectsError.message}</p>
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Settings size={14} /> Cấu hình Redmine trong Settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-50 rounded-lg">
            <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path fill="white" d="M8 12h8M12 8v8" />
            </svg>
          </div>
          <h1 className="font-semibold text-gray-900 text-sm">Redmine</h1>
        </div>

        {/* Project selector */}
        <div className="flex-1 flex items-center gap-3">
          {loadingProjects ? (
            <Loader2 size={14} className="animate-spin text-gray-300" />
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedIssueId(null); }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white min-w-[200px]"
            >
              <option value="">Tất cả dự án</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.identifier || String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => navigate("/redmine/status-config")}
            title="Cấu hình phân loại trạng thái"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter size={12} /> Trạng thái
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={() => navigate("/redmine/hotfix")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Zap size={14} /> Hotfix
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={14} /> Xuất Excel
          </button>
          {selectedProjectId && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} /> Tạo issue
            </button>
          )}
        </div>
      </div>

      {/* Filter / view bar */}
      <div className="bg-white border-b border-gray-50 px-6 py-2 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setPageView("issues")}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${pageView === "issues" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            <List size={11} /> Issues
          </button>
          <button
            onClick={() => setPageView("stats")}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${pageView === "stats" ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}
          >
            <BarChart2 size={11} /> Thống kê
          </button>
        </div>

        <div className="h-4 w-px bg-gray-200" />

        {/* Member selector (always visible) */}
        <MemberSelector
          members={members}
          selectedIds={trackedMemberIds}
          onChange={setTrackedMemberIds}
        />

        <div className="h-4 w-px bg-gray-200" />

        {/* Date range filter (always visible) */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="text-gray-400">Kỳ:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white text-xs"
          />
          <span className="text-gray-300">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white text-xs"
          />
          {(fromDate !== defaultFrom || toDate !== defaultTo) && (
            <button
              onClick={() => { setFromDate(defaultFrom); setToDate(defaultTo); }}
              className="text-gray-400 hover:text-gray-600"
              title="Reset về kỳ mặc định"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {pageView === "issues" && (
          <>
            <div className="h-4 w-px bg-gray-200" />
            <Filter size={13} className="text-gray-300" />

            {/* Status filter — theo mapping config */}
            <div className="flex items-center gap-1">
              {[
                { label: "Tất cả", value: "all" as const },
                { label: "Chưa bắt đầu", value: "todo" as const },
                { label: "Đang thực hiện", value: "in_progress" as const },
                { label: "Đã xong", value: "done" as const },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusCategoryFilter(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    statusCategoryFilter === opt.value
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              value={trackerFilter ?? ""}
              onChange={(e) => setTrackerFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white"
            >
              <option value="">Tất cả loại</option>
              {meta?.trackers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <select
              value={priorityFilter ?? ""}
              onChange={(e) => setPriorityFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white"
            >
              <option value="">Tất cả độ ưu tiên</option>
              {meta?.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* No spend time filter */}
            <button
              onClick={() => setNoSpendTimeFilter((v) => !v)}
              title="Chỉ hiện task đã xong nhưng chưa log thời gian"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                noSpendTimeFilter
                  ? "bg-amber-100 text-amber-700 border-amber-300 font-medium"
                  : "text-gray-500 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {loadingLoggedIds ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />}
              Chưa log time
              {!loadingLoggedIds && doneNoTimeIssues.length > 0 && (
                <span className={`ml-0.5 px-1 rounded-full text-xs font-medium ${noSpendTimeFilter ? "bg-amber-200 text-amber-800" : "bg-red-100 text-red-600"}`}>
                  {doneNoTimeIssues.length}
                </span>
              )}
            </button>

            {(trackerFilter || priorityFilter || statusCategoryFilter !== "all" || noSpendTimeFilter) && (
              <button
                onClick={() => { setTrackerFilter(undefined); setPriorityFilter(undefined); setStatusCategoryFilter("all"); setNoSpendTimeFilter(false); }}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
              >
                <X size={11} /> Xóa filter
              </button>
            )}
          </>
        )}

        <div className="flex-1" />
        {pageView === "issues" && !loadingIssues && (
          <span className="text-xs text-gray-400">{totalCount} issue</span>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {pageView === "stats" ? (
          /* ── Stats view ── */
          <div className="flex-1 overflow-auto p-6">
            <RedmineStats
              projectId={selectedProjectId || undefined}
              members={members}
              selectedMemberIds={trackedMemberIds}
              onMemberSelectionChange={setTrackedMemberIds}
            />
          </div>
        ) : (
          <>
            {/* Issue table */}
            <div className={`flex-1 overflow-auto ${selectedIssueId ? "max-w-[calc(100%-380px)]" : ""}`}>
              {/* Warning banner: done issues without spend time */}
              {!loadingIssues && loadingLoggedIds && (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin flex-shrink-0" />
                  Đang kiểm tra log time...
                </div>
              )}
              {!loadingIssues && !loadingLoggedIds && doneNoTimeIssues.length > 0 && !noSpendTimeFilter && (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <Clock size={13} className="text-amber-500 flex-shrink-0" />
                  <span>
                    <span className="font-semibold">{doneNoTimeIssues.length} task</span> đã xong nhưng chưa log thời gian trong kỳ.
                  </span>
                  <button
                    onClick={() => setNoSpendTimeFilter(true)}
                    className="ml-auto px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded font-medium transition-colors"
                  >
                    Xem ngay
                  </button>
                </div>
              )}

              {loadingIssues ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 size={20} className="animate-spin text-gray-300" />
                </div>
              ) : issues.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                  <CheckCircle size={28} className="text-gray-200" />
                  <p className="text-sm">Không có issue nào</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/60">
                      <th className="px-3 py-2.5 font-medium">#</th>
                      <th className="px-3 py-2.5 font-medium">Tiêu đề</th>
                      <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                      <th className="px-3 py-2.5 font-medium">Loại</th>
                      <th className="px-3 py-2.5 font-medium">Độ ưu tiên</th>
                      <th className="px-3 py-2.5 font-medium">Assignee</th>
                      <th className="px-3 py-2.5 font-medium">Due date</th>
                      <th className="px-3 py-2.5 font-medium">Tiến độ</th>
                      <th className="px-3 py-2.5 font-medium">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue) => {
                      const isDoneNoTime =
                        getIssueCategory(issue) === "done" && isNoLogTime(issue);
                      return (
                        <IssueRow
                          key={issue.id}
                          issue={issue}
                          onSelect={(id) => setSelectedIssueId(id === selectedIssueId ? null : id)}
                          selected={selectedIssueId === issue.id}
                          isDoneNoTime={isDoneNoTime}
                        />
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Detail panel */}
            {selectedIssueId && (
              <div className="w-[380px] flex-shrink-0 border-l border-gray-100 bg-white overflow-hidden flex flex-col">
                <IssuePanel
                  issueId={selectedIssueId}
                  meta={meta}
                  members={members}
                  onClose={() => setSelectedIssueId(null)}
                  onDeleted={() => setSelectedIssueId(null)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && selectedProjectId && (
        <CreateIssueModal
          projectId={selectedProjectId}
          meta={meta}
          members={members}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Export modal */}
      {showExport && (
        <ExportModal
          initialProjectId={selectedProjectId}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
