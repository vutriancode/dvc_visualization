import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageCircle, X, Copy, CheckCheck, Loader2,
  ExternalLink, RefreshCw, ChevronRight,
} from "lucide-react";

// ── Bots ──────────────────────────────────────────────────────────────────────

const BOTS = [
  {
    id: "claude",
    label: "Claude",
    url: "https://claude.ai",
    bg: "bg-[#CC785C] hover:bg-[#b8664c]",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="white" fillOpacity=".9"/>
        <path d="M8.5 15.5L12 8l3.5 7.5M9.5 13.5h5" stroke="#CC785C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com",
    bg: "bg-[#10a37f] hover:bg-[#0d8f6f]",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.512 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
  },
];

const POPUP_W = 480;
const POPUP_H = 760;

function openPopup(url: string) {
  const left = window.screenX + window.outerWidth - POPUP_W - 16;
  const top  = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  window.open(url, `chat_${url}`,
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},` +
    "resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=yes");
}

// ── Context fetching ──────────────────────────────────────────────────────────

function useProjectIdFromRoute() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

async function loadContext(projectId: string): Promise<string> {
  const r = await fetch(`/api/context?project_id=${projectId}`);
  if (!r.ok) throw new Error("Context fetch failed");
  const d = await r.json();
  return d.markdown ?? "";
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const projectId = useProjectIdFromRoute();

  // Auto-fetch context when project changes
  const fetchCtx = useCallback(async (pid: string) => {
    setLoading(true);
    setContext("");
    try {
      const md = await loadContext(pid);
      setContext(md);
    } catch {
      setContext("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) fetchCtx(projectId);
    else setContext("");
  }, [projectId, fetchCtx]);

  const handleCopy = async () => {
    if (!context) return;
    await navigator.clipboard.writeText(context);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = async (url: string) => {
    if (context) {
      try { await navigator.clipboard.writeText(context); } catch {}
    }
    openPopup(url);
  };

  return (
    <>
      {/* ── Tab trigger on right edge ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed top-1/2 -translate-y-1/2 z-40 flex flex-col items-center justify-center gap-1
          transition-all duration-300 rounded-l-xl shadow-lg border border-r-0 border-gray-200
          bg-white hover:bg-gray-50 py-4 px-1.5
          ${open ? "right-[360px]" : "right-0"}`}
        title="AI Chat"
      >
        <MessageCircle size={16} className="text-gray-600" />
        <span className="text-[10px] font-medium text-gray-500 [writing-mode:vertical-lr] rotate-180 tracking-wide">
          AI Chat
        </span>
        <ChevronRight size={12} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        {/* Ready dot */}
        {context && !open && (
          <span className="w-2 h-2 rounded-full bg-green-500 mt-0.5" />
        )}
      </button>

      {/* ── Side panel ───────────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 h-full w-[360px] z-30 bg-white border-l border-gray-200 shadow-2xl
          flex flex-col transition-transform duration-300
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="p-1.5 bg-gray-100 rounded-lg">
            <MessageCircle size={14} className="text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">AI Chat</p>
            <p className="text-xs text-gray-400">
              {projectId ? (context ? "Context dự án đã sẵn sàng" : "Đang tải context...") : "Chọn dự án để có context"}
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={15} />
          </button>
        </div>

        {/* Bot buttons */}
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2 flex-shrink-0">
          {BOTS.map((bot) => (
            <button
              key={bot.id}
              onClick={() => handleOpen(bot.url)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${bot.bg}`}
            >
              {bot.icon}
              {bot.label}
              <ExternalLink size={11} className="opacity-70" />
            </button>
          ))}
        </div>

        {/* Context area */}
        <div className="flex-1 flex flex-col min-h-0 px-4 py-3 gap-2">
          <div className="flex items-center justify-between flex-shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Context dự án
            </p>
            <div className="flex gap-1">
              {projectId && (
                <button
                  onClick={() => fetchCtx(projectId)}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-50"
                  title="Tải lại"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </button>
              )}
              <button
                onClick={handleCopy}
                disabled={!context}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40
                  bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:cursor-not-allowed"
              >
                {copied ? <CheckCheck size={11} className="text-green-600" /> : <Copy size={11} />}
                {copied ? "Đã copy!" : "Copy"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
                <p className="text-xs">Đang lấy dữ liệu dự án...</p>
              </div>
            </div>
          ) : context ? (
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">
              {context}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="p-4 bg-gray-100 rounded-2xl">
                <MessageCircle size={28} className="text-gray-300" />
              </div>
              {projectId ? (
                <p className="text-sm text-gray-400">Không tải được dữ liệu dự án</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-500">Chưa có context</p>
                  <p className="text-xs text-gray-400 max-w-[200px]">
                    Mở một dự án để xem context và chia sẻ với AI
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400 leading-relaxed">
            {context
              ? "Nhấn nút Claude/ChatGPT để mở chat — context sẽ tự copy vào clipboard. Paste vào chat để AI hiểu dự án của bạn."
              : "Mở dự án để load context tự động."}
          </p>
        </div>
      </div>

      {/* Backdrop khi mở trên mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
