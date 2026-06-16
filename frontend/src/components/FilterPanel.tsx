import { useState, useEffect } from "react";
import { Search, Archive, Loader2, CheckSquare, Square, X, FileText } from "lucide-react";
import { formatBytes } from "../utils";
import * as downloadStore from "../store/downloads";

const PRESET_EXTS = ["pdf", "dwg", "dxf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg", "csv", "txt"];

interface FileEntry {
  name: string;
  rel_path: string;
  path: string;
  size: number | null;
}

interface Props {
  type: "ssh" | "rclone";
  basePath: string;
  remote?: string;
  zipName?: string;
  accent: "amber" | "indigo";
  datasetId: string;
}

export function FilterPanel({ type, basePath, remote, zipName = "selection", accent, datasetId }: Props) {
  const [selectedExts, setSelectedExts] = useState<Set<string>>(new Set());
  const [customExt, setCustomExt] = useState("");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Track local download tasks from the global store
  const [activeTasks, setActiveTasks] = useState(() => downloadStore.getTasksForDataset(datasetId));
  useEffect(() => downloadStore.subscribe(() => setActiveTasks(downloadStore.getTasksForDataset(datasetId))), [datasetId]);
  const zipPhase = activeTasks[0]?.phase ?? null;
  const isDownloading = activeTasks.length > 0;

  const chipCls = accent === "amber"
    ? "bg-amber-100 text-amber-700 border-amber-300"
    : "bg-indigo-100 text-indigo-700 border-indigo-300";
  const btnCls = accent === "amber"
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : "bg-indigo-600 hover:bg-indigo-700 text-white";
  const borderCls = accent === "amber" ? "border-amber-200" : "border-indigo-200";

  const toggleExt = (ext: string) => {
    setSelectedExts(prev => {
      const n = new Set(prev);
      n.has(ext) ? n.delete(ext) : n.add(ext);
      return n;
    });
  };

  const addCustom = () => {
    const e = customExt.trim().toLowerCase().replace(/^\./, "");
    if (e) { setSelectedExts(prev => new Set(prev).add(e)); setCustomExt(""); }
  };

  const search = async () => {
    setLoading(true);
    setError(null);
    setFiles(null);
    setChecked(new Set());
    const exts = Array.from(selectedExts).join(",");
    try {
      let url = "";
      if (type === "ssh") {
        url = `/api/storage/ssh/list-filtered?path=${encodeURIComponent(basePath)}&extensions=${encodeURIComponent(exts)}`;
      } else {
        url = `/api/rclone/list-filtered?remote=${encodeURIComponent(remote ?? "")}&path=${encodeURIComponent(basePath)}&extensions=${encodeURIComponent(exts)}`;
      }
      const res = await fetch(url);
      if (!res.ok) { setError(await res.text()); return; }
      const data = await res.json();
      const fetched: FileEntry[] = data.files ?? [];
      setFiles(fetched);
      setChecked(new Set(fetched.map(f => f.rel_path)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    if (!files) return;
    setChecked(prev => prev.size === files.length ? new Set() : new Set(files.map(f => f.rel_path)));
  };

  const toggleOne = (rel: string) => {
    setChecked(prev => {
      const n = new Set(prev);
      n.has(rel) ? n.delete(rel) : n.add(rel);
      return n;
    });
  };

  const downloadZip = () => {
    if (isDownloading || checked.size === 0) return;
    setError(null);
    const filename = `${zipName}.zip`;
    const endpoint = type === "ssh"
      ? "/api/storage/ssh/download-zip-selection"
      : "/api/rclone/download-zip-selection";
    const body = type === "ssh"
      ? { base_path: basePath, rel_paths: Array.from(checked), name: zipName }
      : { remote, base_path: basePath, rel_paths: Array.from(checked), name: zipName };

    // Register globally — download continues even if modal is closed
    downloadStore.startDownload(datasetId, filename, () =>
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).catch(e => setError(String(e)));
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-4 flex-1 overflow-y-auto">
      {/* Current folder indicator */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5 font-mono truncate">
        <span className="text-gray-300 flex-shrink-0">📂</span>
        <span className="truncate" title={basePath}>{basePath || "/"}</span>
      </div>

      {/* Extension chips */}
      <div>
        <p className="text-xs text-gray-500 mb-2 font-medium">Loại file</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_EXTS.map(ext => (
            <button
              key={ext}
              onClick={() => toggleExt(ext)}
              className={`px-2 py-0.5 rounded border text-xs font-mono font-medium transition-colors ${
                selectedExts.has(ext) ? chipCls : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              .{ext}
            </button>
          ))}
          {Array.from(selectedExts).filter(e => !PRESET_EXTS.includes(e)).map(ext => (
            <button
              key={ext}
              onClick={() => toggleExt(ext)}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded border text-xs font-mono font-medium transition-colors ${chipCls}`}
            >
              .{ext} <X size={9} />
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          <input
            type="text"
            placeholder="Thêm đuôi file (vd: ifc)"
            value={customExt}
            onChange={e => setCustomExt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustom()}
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 font-mono"
          />
          <button
            onClick={addCustom}
            className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
          >+</button>
        </div>
      </div>

      {/* Search */}
      <button
        onClick={search}
        disabled={loading}
        className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${btnCls}`}
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Đang tìm…</>
          : <><Search size={14} /> Tìm trong thư mục và thư mục con</>}
      </button>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</p>
      )}

      {/* Results */}
      {files !== null && (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {checked.size > 0 && checked.size === files.length
                ? <CheckSquare size={14} className="text-blue-500" />
                : <Square size={14} />}
              {files.length === 0
                ? "Không tìm thấy file"
                : `${checked.size} / ${files.length} file đã chọn`}
            </button>
            {checked.size > 0 && (
              <button
                onClick={downloadZip}
                disabled={isDownloading}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-70 ${btnCls}`}
              >
                {zipPhase === "zipping"
                  ? <><Loader2 size={12} className="animate-spin" /> Đang nén…</>
                  : zipPhase === "downloading"
                  ? <><Loader2 size={12} className="animate-spin" /> Đang tải…</>
                  : <><Archive size={12} /> ZIP ({checked.size})</>}
              </button>
            )}
          </div>

          <div className={`border ${borderCls} rounded-lg overflow-hidden max-h-64 overflow-y-auto`}>
            {files.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Không có file nào phù hợp</p>
            ) : (
              files.map(f => (
                <div
                  key={f.rel_path}
                  onClick={() => toggleOne(f.rel_path)}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                >
                  {checked.has(f.rel_path)
                    ? <CheckSquare size={13} className="text-blue-500 flex-shrink-0" />
                    : <Square size={13} className="text-gray-300 flex-shrink-0" />}
                  <FileText size={12} className="text-gray-300 flex-shrink-0" />
                  <span
                    className="flex-1 text-xs text-gray-700 truncate"
                    title={f.rel_path}
                  >{f.rel_path}</span>
                  {f.size !== null && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(f.size)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
