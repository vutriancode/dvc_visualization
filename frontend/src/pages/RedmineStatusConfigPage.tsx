import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import { useRedmineMeta } from "../hooks/useRedmine";
import { useRedmineStatusMapping, useSaveRedmineStatusMapping } from "../hooks/useRedmine";

type Category = "todo" | "in_progress" | "done" | "";

const CATEGORIES: { value: Category; label: string; color: string; bg: string; border: string }[] = [
  { value: "todo",        label: "Chưa bắt đầu",    color: "text-gray-600",  bg: "bg-gray-50",   border: "border-gray-200" },
  { value: "in_progress", label: "Đang thực hiện",   color: "text-blue-600",  bg: "bg-blue-50",   border: "border-blue-200" },
  { value: "done",        label: "Đã xong",           color: "text-green-600", bg: "bg-green-50",  border: "border-green-200" },
];

const CAT_BADGE: Record<string, string> = {
  todo:        "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  done:        "bg-green-100 text-green-700",
};

export function RedmineStatusConfigPage() {
  const navigate = useNavigate();
  const { data: meta, isLoading: loadingMeta, error: metaError } = useRedmineMeta();
  const { data: savedMapping, isLoading: loadingMapping } = useRedmineStatusMapping();
  const saveMapping = useSaveRedmineStatusMapping();

  // local draft: { statusId: category }
  const [draft, setDraft] = useState<Record<string, Category>>({});
  const [saved, setSaved] = useState(false);

  // Populate draft when data loads
  useEffect(() => {
    if (meta && savedMapping !== undefined) {
      const initial: Record<string, Category> = {};
      meta.statuses.forEach((s) => {
        const sid = String(s.id);
        initial[sid] = (savedMapping[sid] as Category) || (s.is_closed ? "done" : "todo");
      });
      setDraft(initial);
    }
  }, [meta, savedMapping]);

  const handleSave = async () => {
    // Only save entries that are not empty
    const toSave: Record<string, string> = {};
    Object.entries(draft).forEach(([k, v]) => { if (v) toSave[k] = v; });
    await saveMapping.mutateAsync(toSave);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    if (!meta) return;
    const reset: Record<string, Category> = {};
    meta.statuses.forEach((s) => {
      reset[String(s.id)] = s.is_closed ? "done" : "todo";
    });
    setDraft(reset);
  };

  const isLoading = loadingMeta || loadingMapping;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => navigate("/redmine")}
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
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">Cấu hình trạng thái Redmine</h1>
            <p className="text-xs text-gray-400">Phân loại từng trạng thái để tính thống kê chính xác</p>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={12} /> Đặt lại mặc định
        </button>
        <button
          onClick={handleSave}
          disabled={saveMapping.isPending || isLoading}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {saveMapping.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <CheckCircle size={13} />
          ) : (
            <Save size={13} />
          )}
          {saved ? "Đã lưu!" : "Lưu cấu hình"}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin text-gray-300" />
          </div>
        ) : metaError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <AlertCircle size={32} className="text-red-300" />
            <p className="text-sm text-gray-500">Không thể tải danh sách trạng thái từ Redmine</p>
            <p className="text-xs text-gray-400">{metaError.message}</p>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="flex gap-3 mb-6 flex-wrap">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cat.bg} ${cat.border}`}
                >
                  <span className={`text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                  <span className="text-xs text-gray-400">
                    {cat.value === "todo"
                      ? "— Chưa được xử lý, tính vào task còn lại"
                      : cat.value === "in_progress"
                      ? "— Đang tiến hành, tính vào task còn lại"
                      : "— Đã hoàn thành, không tính vào task còn lại"}
                  </span>
                </div>
              ))}
            </div>

            {/* Status table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/60">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  <span>Trạng thái Redmine</span>
                  <span className="w-28 text-center">Chưa bắt đầu</span>
                  <span className="w-32 text-center">Đang thực hiện</span>
                  <span className="w-20 text-center">Đã xong</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {meta?.statuses.map((status) => {
                  const sid = String(status.id);
                  const current = draft[sid] ?? "";
                  return (
                    <div
                      key={status.id}
                      className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Status name + default badge */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm text-gray-800 font-medium">{status.name}</span>
                        {status.is_closed && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-400">
                            is_closed
                          </span>
                        )}
                        {current && (
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${CAT_BADGE[current]}`}>
                            {CATEGORIES.find((c) => c.value === current)?.label}
                          </span>
                        )}
                      </div>

                      {/* Radio buttons */}
                      {(["todo", "in_progress", "done"] as const).map((cat) => (
                        <div key={cat} className="w-28 flex justify-center">
                          <label className="relative cursor-pointer group">
                            <input
                              type="radio"
                              name={`status-${sid}`}
                              value={cat}
                              checked={current === cat}
                              onChange={() => setDraft({ ...draft, [sid]: cat })}
                              className="sr-only"
                            />
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                current === cat
                                  ? cat === "todo"
                                    ? "border-gray-400 bg-gray-400"
                                    : cat === "in_progress"
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-green-500 bg-green-500"
                                  : "border-gray-200 group-hover:border-gray-300 bg-white"
                              }`}
                            >
                              {current === cat && (
                                <div className="w-2 h-2 rounded-full bg-white" />
                              )}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {saveMapping.isError && (
              <div className="mt-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-xs text-red-600">
                <AlertCircle size={13} /> {saveMapping.error?.message}
              </div>
            )}

            <div className="mt-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600">
              <strong>Lưu ý:</strong> Cấu hình này ảnh hưởng đến cột "Task còn lại" trong bảng thống kê và burndown chart.
              Các trạng thái <em>Chưa bắt đầu</em> và <em>Đang thực hiện</em> sẽ được tính là task chưa hoàn thành.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
