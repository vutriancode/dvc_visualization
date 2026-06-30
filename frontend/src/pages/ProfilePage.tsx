import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { User, KeyRound, Shield, ArrowLeft, Loader2, Check, Eye, EyeOff, Terminal, Copy, RefreshCw, Trash2, X } from "lucide-react";

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

interface CredStatus {
  gitlab_token_set: boolean;
  redmine_api_key_set: boolean;
}

interface PatStatus {
  has_token: boolean;
  prefix: string;
}

function PatModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState<"token" | "config" | null>(null);

  const mcpConfig = JSON.stringify({
    mcpServers: {
      dashboard: { url: `http://localhost:3005/sse?token=${token}` },
      redmine:   { url: `http://localhost:3006/sse?token=${token}` },
    },
  }, null, 2);

  function copy(text: string, kind: "token" | "config") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Personal Access Token</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <span className="text-base">⚠️</span>
            <span>Sao chép token ngay bây giờ — sẽ không hiển thị lại sau khi đóng cửa sổ này.</span>
          </div>

          {/* Token */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Token của bạn</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 font-mono break-all text-gray-800 select-all">
                {token}
              </code>
              <button
                onClick={() => copy(token, "token")}
                className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition"
              >
                {copied === "token" ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* MCP config */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Cấu hình MCP cho Claude Desktop (dán vào <code className="bg-gray-100 px-1 rounded">claude_desktop_config.json</code>)</p>
            <div className="relative">
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap">
                {mcpConfig}
              </pre>
              <button
                onClick={() => copy(mcpConfig, "config")}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition"
              >
                {copied === "config" ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            Đã sao chép, đóng lại
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // --- Personal info ---
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [infoErr, setInfoErr] = useState("");

  // --- Change password ---
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);

  // --- PAT ---
  const [patStatus, setPatStatus] = useState<PatStatus | null>(null);
  const [patLoading, setPatLoading] = useState(false);
  const [patErr, setPatErr] = useState("");
  const [newPat, setNewPat] = useState<string | null>(null); // shown once in modal

  useEffect(() => {
    apiFetch<PatStatus>("/api/users/me/token/status")
      .then(setPatStatus)
      .catch(() => {});
  }, []);

  async function handleGeneratePat() {
    setPatLoading(true);
    setPatErr("");
    try {
      const { token } = await apiFetch<{ token: string }>("/api/users/me/token", { method: "POST" });
      setNewPat(token);
      setPatStatus({ has_token: true, prefix: token.slice(0, 12) });
    } catch (err: unknown) {
      setPatErr(err instanceof Error ? err.message : "Lỗi khi tạo token");
    } finally {
      setPatLoading(false);
    }
  }

  async function handleRevokePat() {
    if (!confirm("Revoke token? Các MCP đang dùng token này sẽ mất quyền truy cập.")) return;
    setPatLoading(true);
    setPatErr("");
    try {
      await apiFetch("/api/users/me/token", { method: "DELETE" });
      setPatStatus({ has_token: false, prefix: "" });
    } catch (err: unknown) {
      setPatErr(err instanceof Error ? err.message : "Lỗi khi revoke token");
    } finally {
      setPatLoading(false);
    }
  }

  // --- Credentials ---
  const [credStatus, setCredStatus] = useState<CredStatus | null>(null);
  const [gitlabToken, setGitlabToken] = useState("");
  const [redmineKey, setRedmineKey] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState("");
  const [credsErr, setCredsErr] = useState("");
  const [showGitlab, setShowGitlab] = useState(false);
  const [showRedmine, setShowRedmine] = useState(false);

  useEffect(() => {
    apiFetch<CredStatus>("/api/users/me/credentials")
      .then(setCredStatus)
      .catch(() => {});
  }, []);

  async function handleSaveInfo(e: FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoMsg("");
    setInfoErr("");
    try {
      await apiFetch(`/api/users/${user!.id}`, {
        method: "PUT",
        body: JSON.stringify({ display_name: displayName }),
      });
      setInfoMsg("Đã lưu thông tin thành công.");
    } catch (err: unknown) {
      setInfoErr(err instanceof Error ? err.message : "Lỗi khi lưu");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (newPw !== confirmPw) {
      setPwErr("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (newPw.length < 6) {
      setPwErr("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    setSavingPw(true);
    try {
      // Verify old password by re-logging in
      const verifyRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user!.username, password: currentPw }),
      });
      if (!verifyRes.ok) {
        setPwErr("Mật khẩu hiện tại không đúng.");
        return;
      }
      await apiFetch(`/api/users/${user!.id}`, {
        method: "PUT",
        body: JSON.stringify({ password: newPw }),
      });
      setPwMsg("Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      // Log out after password change
      setTimeout(async () => { await logout(); navigate("/login"); }, 2000);
    } catch (err: unknown) {
      setPwErr(err instanceof Error ? err.message : "Lỗi khi đổi mật khẩu");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleSaveCreds(e: FormEvent) {
    e.preventDefault();
    setSavingCreds(true);
    setCredsMsg("");
    setCredsErr("");
    try {
      const body: Record<string, string> = {};
      if (gitlabToken !== "") body.gitlab_token = gitlabToken;
      if (redmineKey !== "") body.redmine_api_key = redmineKey;
      const updated = await apiFetch<CredStatus>("/api/users/me/credentials", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setCredStatus(updated);
      setGitlabToken("");
      setRedmineKey("");
      setCredsMsg("Đã cập nhật credentials thành công.");
    } catch (err: unknown) {
      setCredsErr(err instanceof Error ? err.message : "Lỗi khi lưu credentials");
    } finally {
      setSavingCreds(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-gray-800">Hồ sơ cá nhân</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <User size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Thông tin cá nhân</h2>
          </div>
          <form onSubmit={handleSaveInfo} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Tên hiển thị</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Tên đăng nhập</label>
              <input
                type="text"
                value={user?.username ?? ""}
                readOnly
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Vai trò</label>
              <input
                type="text"
                value={user?.role === "admin" ? "Quản trị viên" : "Thành viên"}
                readOnly
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>
            {infoMsg && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check size={14} /> {infoMsg}
              </div>
            )}
            {infoErr && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{infoErr}</div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingInfo}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                  hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {savingInfo && <Loader2 size={14} className="animate-spin" />}
                Lưu thông tin
              </button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <KeyRound size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Đổi mật khẩu</h2>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Mật khẩu hiện tại</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Mật khẩu mới</label>
              <div className="relative">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Tối thiểu 6 ký tự"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            {pwMsg && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check size={14} /> {pwMsg}
              </div>
            )}
            {pwErr && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwErr}</div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPw}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                  hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {savingPw && <Loader2 size={14} className="animate-spin" />}
                Đổi mật khẩu
              </button>
            </div>
          </form>
        </div>

        {/* Personal Credentials */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <Shield size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Credentials cá nhân</h2>
          </div>
          <form onSubmit={handleSaveCreds} className="p-6 space-y-4">
            <p className="text-xs text-gray-400">Để trống = dùng token của tổ chức</p>

            {/* GitLab token */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                GitLab Personal Token
                {credStatus?.gitlab_token_set && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    <Check size={11} /> Đã cấu hình
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showGitlab ? "text" : "password"}
                  value={gitlabToken}
                  onChange={(e) => setGitlabToken(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm font-mono
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={credStatus?.gitlab_token_set ? "••• Để trống = giữ nguyên" : "glpat-xxxxxxxxxxxx"}
                />
                <button
                  type="button"
                  onClick={() => setShowGitlab(!showGitlab)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showGitlab ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Redmine key */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Redmine API Key
                {credStatus?.redmine_api_key_set && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    <Check size={11} /> Đã cấu hình
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showRedmine ? "text" : "password"}
                  value={redmineKey}
                  onChange={(e) => setRedmineKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm font-mono
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={credStatus?.redmine_api_key_set ? "••• Để trống = giữ nguyên" : "Nhập Redmine API key"}
                />
                <button
                  type="button"
                  onClick={() => setShowRedmine(!showRedmine)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showRedmine ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {credsMsg && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <Check size={14} /> {credsMsg}
              </div>
            )}
            {credsErr && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{credsErr}</div>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingCreds}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                  hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {savingCreds && <Loader2 size={14} className="animate-spin" />}
                Lưu credentials
              </button>
            </div>
          </form>
        </div>

        {/* Personal Access Token */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100 bg-gray-50">
            <Terminal size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">MCP Personal Access Token</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Tạo một token lâu dài để nhúng vào URL của MCP server trong Claude Desktop.
              MCP sẽ tự động dùng GitLab token và Redmine API key trong tài khoản của bạn.
            </p>

            {patStatus?.has_token ? (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Token hiện tại</p>
                  <code className="text-sm font-mono text-gray-700">{patStatus.prefix}…</code>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGeneratePat}
                    disabled={patLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700
                      bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition disabled:opacity-50"
                  >
                    {patLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Tạo lại
                  </button>
                  <button
                    onClick={handleRevokePat}
                    disabled={patLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600
                      bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                  >
                    {patLoading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Revoke
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGeneratePat}
                disabled={patLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium
                  rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {patLoading ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                Tạo Personal Access Token
              </button>
            )}

            {patErr && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{patErr}</div>
            )}

            {patStatus?.has_token && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
                <p className="font-medium">Cách dùng trong Claude Desktop:</p>
                <code className="block mt-1 text-xs font-mono bg-white border border-blue-100 rounded px-2 py-1 text-gray-700">
                  {`"url": "http://localhost:3005/sse?token=${patStatus.prefix}…"`}
                </code>
                <p className="text-blue-600">Nhấn "Tạo lại" để xem lại config đầy đủ với token thật.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* PAT modal — shown once after generation */}
      {newPat && <PatModal token={newPat} onClose={() => setNewPat(null)} />}
    </div>
  );
}
