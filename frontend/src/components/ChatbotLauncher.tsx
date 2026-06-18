import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, ExternalLink, Copy, CheckCheck, Loader2 } from "lucide-react";

const BOTS = [
  {
    id: "claude",
    label: "Claude",
    url: "https://claude.ai",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#CC785C" />
        <path d="M8.5 15.5L12 8l3.5 7.5M9.5 13.5h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    bg: "bg-[#CC785C]",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.512 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
      </svg>
    ),
    bg: "bg-[#10a37f]",
  },
];

const POPUP_W = 460;
const POPUP_H = 720;

function openPopup(url: string) {
  const left = window.screenX + window.outerWidth - POPUP_W - 20;
  const top  = window.screenY + (window.outerHeight - POPUP_H) / 2;
  window.open(
    url,
    "chatbot_popup",
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},` +
    "resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=yes,status=no",
  );
}

// ── Context detection ─────────────────────────────────────────────────────────

function useProjectIdFromRoute() {
  const location = useLocation();
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

async function fetchContext(projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  try {
    const resp = await fetch(`/api/context?project_id=${projectId}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.markdown ?? null;
  } catch {
    return null;
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastState = "idle" | "loading" | "copied" | "opened";

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatbotLauncher() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>("idle");
  const [contextMd, setContextMd] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const projectId = useProjectIdFromRoute();

  // Pre-fetch context when on a project page
  useEffect(() => {
    setContextMd(null);
    if (!projectId) return;
    setFetching(true);
    fetchContext(projectId).then((md) => {
      setContextMd(md);
      setFetching(false);
    });
  }, [projectId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = useCallback(async (botUrl: string) => {
    setOpen(false);

    // Fetch context if not yet loaded (e.g. user didn't wait for prefetch)
    let md = contextMd;
    if (!md && projectId) {
      setToast("loading");
      md = await fetchContext(projectId);
      setContextMd(md);
    }

    if (md) {
      try {
        await navigator.clipboard.writeText(md);
        setToast("copied");
        setTimeout(() => setToast("opened"), 1800);
      } catch {
        // clipboard denied — open anyway
      }
    }

    openPopup(botUrl);
    setTimeout(() => setToast("idle"), 4000);
  }, [contextMd, projectId]);

  const handleCopyOnly = useCallback(async () => {
    let md = contextMd;
    if (!md && projectId) {
      setToast("loading");
      md = await fetchContext(projectId);
      setContextMd(md);
    }
    if (md) {
      await navigator.clipboard.writeText(md);
      setToast("copied");
      setTimeout(() => setToast("idle"), 2500);
    }
    setOpen(false);
  }, [contextMd, projectId]);

  const hasContext = !!projectId;

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* Toast */}
      {toast !== "idle" && (
        <div className="mb-1 bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {toast === "loading" && <Loader2 size={12} className="animate-spin" />}
          {toast === "copied" && <CheckCheck size={12} className="text-green-400" />}
          {toast === "opened" && <ExternalLink size={12} className="text-blue-400" />}
          {toast === "loading" && "Đang lấy dữ liệu dự án..."}
          {toast === "copied" && "Đã copy context! Paste vào chat để bắt đầu"}
          {toast === "opened" && "Cửa sổ chat đã mở"}
        </div>
      )}

      {/* Menu */}
      {open && (
        <div className="mb-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden w-64 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Mở AI Chat</p>
            {hasContext && (
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                {fetching
                  ? <><Loader2 size={10} className="animate-spin" /> Đang tải context dự án...</>
                  : contextMd
                    ? <><CheckCheck size={10} className="text-green-500" /> Context sẵn sàng — sẽ tự copy khi mở</>
                    : "Không có context dự án"}
              </p>
            )}
          </div>

          {BOTS.map((bot) => (
            <button
              key={bot.id}
              onClick={() => handleOpen(bot.url)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${bot.bg}`}>
                {bot.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{bot.label}</p>
                <p className="text-xs text-gray-400">
                  {hasContext && contextMd ? "Mở + copy context" : "Mở chat"}
                </p>
              </div>
              <ExternalLink size={12} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
            </button>
          ))}

          {/* Copy context only button */}
          {hasContext && contextMd && (
            <button
              onClick={handleCopyOnly}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-t border-gray-100 text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Copy size={14} className="text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Chỉ copy context</p>
                <p className="text-xs text-gray-400">Paste vào bất kỳ AI nào</p>
              </div>
            </button>
          )}

          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {hasContext
                ? "Context được copy tự động để paste vào chat"
                : "Mở dưới dạng popup bên phải màn hình"}
            </p>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 text-white ring-4 ring-white ${
          open ? "bg-gray-700 hover:bg-gray-800" : "bg-gray-800 hover:bg-gray-900"
        }`}
        title="AI Chat"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {/* Green dot when context ready */}
        {!open && hasContext && contextMd && (
          <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
        )}
      </button>
    </div>
  );
}
