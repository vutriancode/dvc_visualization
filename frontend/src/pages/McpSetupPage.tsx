import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft, Bot, Copy, Check, Loader2, RefreshCw,
  Trash2, Terminal, AlertCircle, ExternalLink, X,
} from "lucide-react";

const TOKEN_KEY = "dashboard_token";

function getSessionToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getSessionToken();
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

interface PatStatus {
  has_token: boolean;
  prefix: string;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200
        text-gray-600 hover:bg-gray-50 transition"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {copied ? "Đã copy" : label}
    </button>
  );
}

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className={`text-xs font-mono bg-gray-950 text-gray-100 rounded-xl p-4 overflow-x-auto whitespace-pre ${lang}`}>
        {code}
      </pre>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function NewTokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const config = buildConfig(token);
  const [copiedWhat, setCopiedWhat] = useState<"token" | "config" | null>(null);
  function copy(text: string, kind: "token" | "config") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWhat(kind);
      setTimeout(() => setCopiedWhat(null), 2000);
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-800">
            <Terminal size={17} className="text-blue-500" />
            <span className="font-semibold text-sm">Token mới đã được tạo</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>Sao chép token ngay bây giờ — sẽ <strong>không hiển thị lại</strong> sau khi đóng.</span>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Token của bạn</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5
                font-mono break-all text-gray-800 select-all">
                {token}
              </code>
              <button
                onClick={() => copy(token, "token")}
                className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition"
              >
                {copiedWhat === "token" ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">
              Config cho Claude Desktop
              <span className="ml-1 font-normal text-gray-400">(dán vào <code className="bg-gray-100 px-1 rounded">claude_desktop_config.json</code>)</span>
            </p>
            <div className="relative">
              <pre className="text-xs bg-gray-950 text-gray-100 rounded-xl p-4 font-mono overflow-x-auto whitespace-pre">
                {config}
              </pre>
              <button
                onClick={() => copy(config, "config")}
                className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                  rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 border border-white/10 transition"
              >
                {copiedWhat === "config" ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copiedWhat === "config" ? "Đã copy" : "Copy"}
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

function buildConfig(token: string) {
  return JSON.stringify({
    mcpServers: {
      dashboard: {
        url: `http://localhost:3005/sse?token=${token}`,
      },
      redmine: {
        url: `http://localhost:3006/sse?token=${token}`,
      },
    },
  }, null, 2);
}

export function McpSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [patStatus, setPatStatus] = useState<PatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [err, setErr] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PatStatus>("/api/users/me/token/status")
      .then(setPatStatus)
      .catch(() => setPatStatus({ has_token: false, prefix: "" }))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setActionLoading(true);
    setErr("");
    try {
      const { token } = await apiFetch<{ token: string }>("/api/users/me/token", { method: "POST" });
      setNewToken(token);
      setPatStatus({ has_token: true, prefix: token.slice(0, 12) });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke token? Các kết nối MCP đang dùng token này sẽ ngừng hoạt động.")) return;
    setActionLoading(true);
    setErr("");
    try {
      await apiFetch("/api/users/me/token", { method: "DELETE" });
      setPatStatus({ has_token: false, prefix: "" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setActionLoading(false);
    }
  }

  const placeholderConfig = buildConfig("<your-token>");

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
        <Bot size={20} className="text-blue-500" />
        <h1 className="text-lg font-semibold text-gray-800">Kết nối MCP</h1>
        <span className="ml-auto text-xs text-gray-400">
          Đang đăng nhập: <span className="font-medium text-gray-600">{user?.display_name || user?.username}</span>
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Step 1 — PAT */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
              <h2 className="text-sm font-semibold text-gray-700">Tạo Personal Access Token</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              Token này nhúng vào URL MCP để xác định danh tính của bạn khi Claude gọi API.
            </p>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Đang tải…
              </div>
            ) : patStatus?.has_token ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Check size={14} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">Token đang hoạt động</span>
                    </div>
                    <code className="text-xs font-mono text-gray-500">{patStatus.prefix}…</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700
                        bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition"
                    >
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Tạo lại
                    </button>
                    <button
                      onClick={handleRevoke}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600
                        bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition"
                    >
                      {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Revoke
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Nhấn "Tạo lại" để xem lại config đầy đủ với token mới.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-400">
                  <AlertCircle size={15} /> Chưa có token nào
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium
                    rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                  Tạo Personal Access Token
                </button>
              </div>
            )}

            {err && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>
            )}
          </div>
        </div>

        {/* Step 2 — Credentials (reminder) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
              <h2 className="text-sm font-semibold text-gray-700">Cấu hình credentials cá nhân (tuỳ chọn)</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              Nếu GitLab token / Redmine API key của bạn khác với tổ chức, hãy cấu hình trong Profile.
            </p>
          </div>
          <div className="p-6">
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm text-gray-600
                rounded-lg hover:bg-gray-50 transition"
            >
              <ExternalLink size={14} />
              Mở trang Profile
            </button>
          </div>
        </div>

        {/* Step 3 — Claude Desktop config */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
              <h2 className="text-sm font-semibold text-gray-700">Thêm vào Claude Desktop</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-7">
              Dán đoạn JSON sau vào <code className="bg-gray-100 px-1 rounded">claude_desktop_config.json</code>
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="text-xs text-gray-500 space-y-1">
              <p>Vị trí file config:</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-400 ml-2">
                <li>macOS: <code className="bg-gray-100 px-1 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
                <li>Windows: <code className="bg-gray-100 px-1 rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
              </ul>
            </div>

            <CodeBlock code={placeholderConfig} />

            {patStatus?.has_token && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                <AlertCircle size={13} className="shrink-0" />
                Thay <code className="bg-white/60 px-1 rounded font-mono">&lt;your-token&gt;</code> bằng token thật của bạn.
                Nhấn "Tạo lại" ở bước 1 để lấy config đầy đủ với token thật.
              </div>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Cách hoạt động</h2>
          </div>
          <div className="p-6">
            <ol className="space-y-3 text-sm text-gray-600">
              {[
                ["Claude Desktop", "Kết nối đến MCP server qua SSE URL có chứa token của bạn"],
                ["MCP Server", "Đọc token từ URL → forward vào mọi API call đến dashboard backend"],
                ["Backend", "Xác thực token → biết đây là bạn → dùng GitLab token & Redmine key của bạn"],
                ["Kết quả", "Mỗi người thấy đúng dữ liệu theo quyền hạn của mình"],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">{title}</span>
                    <span className="text-gray-400"> — </span>
                    {desc}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

      </div>

      {newToken && <NewTokenModal token={newToken} onClose={() => setNewToken(null)} />}
    </div>
  );
}
