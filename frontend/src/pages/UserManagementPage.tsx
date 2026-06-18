import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Users, ArrowLeft, PlusCircle, Pencil, Trash2,
  Loader2, Check, X, Shield, KeyRound,
} from "lucide-react";

const TOKEN_KEY = "dashboard_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return res.status !== 204 ? res.json() : (undefined as unknown as T);
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: string;
  gitlab_token_set?: boolean;
  redmine_api_key_set?: boolean;
}

// ── Add User Modal ────────────────────────────────────────────────────────────

interface AddUserModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddUserModal({ onClose, onCreated }: AddUserModalProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/users/", {
        method: "POST",
        body: JSON.stringify({ username, display_name: displayName, password, role }),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi tạo user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Thêm người dùng</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Tên đăng nhập *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="john.doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Tên hiển thị</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Mật khẩu *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Vai trò</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "admin")}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="member">Thành viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Tạo người dùng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRow;
  onClose: () => void;
  onUpdated: () => void;
}

function EditUserModal({ user, onClose, onUpdated }: EditUserModalProps) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState<"member" | "admin">(user.role as "member" | "admin");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, string> = { display_name: displayName, role };
      if (newPassword) body.password = newPassword;
      await apiFetch(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      onUpdated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi cập nhật user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Sửa người dùng — {user.username}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Tên hiển thị</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Vai trò</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "admin")}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="member">Thành viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Đặt lại mật khẩu <span className="text-gray-400 font-normal">(để trống = không đổi)</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Mật khẩu mới (tùy chọn)"
            />
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<UserRow[]>("/api/users/");
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi tải danh sách user");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Xác nhận xóa người dùng này?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/users/${id}`, { method: "DELETE" });
      setSuccessMsg("Đã xóa người dùng.");
      loadUsers();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi xóa user");
    } finally {
      setDeletingId(null);
    }
  }

  function handleRefresh() {
    loadUsers();
    setSuccessMsg("Đã làm mới danh sách.");
    setTimeout(() => setSuccessMsg(""), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modals */}
      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={loadUsers}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onUpdated={loadUsers}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-800">Quản lý người dùng</h1>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
            hover:bg-blue-700 transition"
        >
          <PlusCircle size={15} />
          Thêm người dùng
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {successMsg && (
          <div className="flex items-center gap-2 mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
            <Check size={14} /> {successMsg}
          </div>
        )}
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Đang tải...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">Chưa có người dùng nào.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Người dùng
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Vai trò
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Credentials
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-800">{u.username}</div>
                      {u.display_name && (
                        <div className="text-xs text-gray-400 mt-0.5">{u.display_name}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700
                          bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          <Shield size={10} /> Admin
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          Member
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className={`flex items-center gap-1 ${u.gitlab_token_set ? "text-green-600" : ""}`}>
                          GitLab {u.gitlab_token_set ? <Check size={11} /> : <X size={11} className="text-gray-300" />}
                        </span>
                        <span className={`flex items-center gap-1 ${u.redmine_api_key_set ? "text-green-600" : ""}`}>
                          <KeyRound size={11} /> Redmine {u.redmine_api_key_set ? <Check size={11} /> : <X size={11} className="text-gray-300" />}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                          title="Sửa"
                        >
                          <Pencil size={14} />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={deletingId === u.id}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition
                              disabled:opacity-50"
                            title="Xóa"
                          >
                            {deletingId === u.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleRefresh}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            Làm mới
          </button>
        </div>
      </div>
    </div>
  );
}
