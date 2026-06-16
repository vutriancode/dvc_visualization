import { useState, useEffect } from "react";
import { X, FolderOpen, Download, Loader2, ChevronRight, ArrowLeft, Cloud, Archive } from "lucide-react";
import { useRcloneBrowse } from "../hooks/useRclone";
import type { Dataset } from "../types";
import { formatBytes } from "../utils";
import { FilterPanel } from "./FilterPanel";
import * as downloadStore from "../store/downloads";

const PROVIDER_LABELS: Record<string, string> = {
  drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  box: "Box",
};

interface Props {
  dataset: Dataset;
  onClose: () => void;
}

type ZipPhase = "zipping" | "downloading";

export function RcloneDownloadModal({ dataset, onClose }: Props) {
  const rootPath = dataset.path ?? "";
  const remote = dataset.rclone_remote ?? "";
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [tab, setTab] = useState<"browse" | "filter">("browse");

  // Sync browse-mode ZIP state from global store (persists after modal closes)
  const [zipStates, setZipStates] = useState<Map<string, ZipPhase>>(new Map());
  useEffect(() => downloadStore.subscribe(() => {
    const tasks = downloadStore.getTasksForDataset(dataset.id);
    setZipStates(new Map(tasks.map(t => [t.filename, t.phase])));
  }), [dataset.id]);

  const { data, isLoading, error } = useRcloneBrowse(remote, currentPath);

  const providerLabel = PROVIDER_LABELS[dataset.provider ?? ""] ?? dataset.project_name;

  const segments = currentPath.split("/").filter(Boolean);
  const rootSegments = rootPath.split("/").filter(Boolean);

  const navigate = (path: string) => setCurrentPath(path);

  const goUp = () => {
    const parent = currentPath.split("/").slice(0, -1).join("/");
    if (parent.length < rootPath.length) return;
    navigate(parent);
  };

  const fileDownloadUrl = (filePath: string, fileName: string) =>
    `/api/rclone/download?remote=${encodeURIComponent(remote)}&path=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`;

  const folderDownloadUrl = (folderPath: string, folderName: string) =>
    `/api/rclone/download-folder?remote=${encodeURIComponent(remote)}&path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(folderName)}`;

  const downloadZip = (folderPath: string, folderName: string) => {
    const filename = `${folderName}.zip`;
    if (downloadStore.getTasksForDataset(dataset.id).some(t => t.filename === filename)) return;
    downloadStore.startDownload(dataset.id, filename, () =>
      fetch(folderDownloadUrl(folderPath, folderName))
    ).catch(err => console.error("ZIP download failed:", err));
  };

  const currentFolderName = currentPath.split("/").filter(Boolean).pop() || remote;
  const headerPhase = zipStates.get(`${currentFolderName}.zip`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Cloud size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{dataset.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{providerLabel} · {remote}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadZip(currentPath, currentFolderName)}
              disabled={!!headerPhase}
              className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-80 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors font-medium min-w-[80px] justify-center"
            >
              {headerPhase === "zipping" ? (
                <><Loader2 size={12} className="animate-spin" /> Đang nén…</>
              ) : headerPhase === "downloading" ? (
                <><Loader2 size={12} className="animate-spin" /> Đang tải…</>
              ) : (
                <><Archive size={13} /> ZIP</>
              )}
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(["browse", "filter"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t ? "border-b-2 border-indigo-500 text-indigo-700" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "browse" ? "Duyệt" : "Lọc file"}
            </button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            {/* Breadcrumb */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1 flex-wrap flex-shrink-0 text-xs">
              {currentPath !== rootPath && (
                <button onClick={goUp}
                  className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors mr-1">
                  <ArrowLeft size={11} /> Back
                </button>
              )}
              {segments.map((seg, i) => {
                const path = segments.slice(0, i + 1).join("/");
                const isAboveRoot = i < rootSegments.length - 1;
                return (
                  <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={10} className="text-gray-300" />}
                    <button
                      onClick={() => !isAboveRoot && navigate(path)}
                      disabled={isAboveRoot}
                      className={`transition-colors ${
                        path === currentPath ? "text-gray-700 font-medium"
                        : isAboveRoot ? "text-gray-300 cursor-default"
                        : "text-indigo-600 hover:underline"
                      }`}
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 size={18} className="animate-spin mr-2" /> Loading…
                </div>
              )}
              {error && (
                <div className="px-6 py-4 text-sm text-red-600 bg-red-50">
                  {String((error as Error).message)}
                </div>
              )}
              {data && data.entries.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">Empty folder</div>
              )}
              {data && data.entries.map((entry) => {
                const phase = zipStates.get(`${entry.name}.zip`);
                return (
                  <div key={entry.path}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0">
                    <FolderOpen
                      size={15}
                      className={`flex-shrink-0 ${entry.is_dir ? "text-indigo-400" : "text-gray-300"}`}
                    />
                    {entry.is_dir ? (
                      <button onClick={() => navigate(entry.path)}
                        className="flex-1 text-sm text-left text-gray-800 hover:text-indigo-600 transition-colors truncate">
                        {entry.name}
                      </button>
                    ) : (
                      <span className="flex-1 text-sm text-gray-700 truncate">{entry.name}</span>
                    )}

                    {!entry.is_dir && entry.size !== null && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatBytes(entry.size)}</span>
                    )}

                    {/* File download */}
                    {!entry.is_dir && (
                      <a
                        href={fileDownloadUrl(entry.path, entry.name)}
                        download={entry.name}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={12} /> Tải
                      </a>
                    )}

                    {/* Folder ZIP download */}
                    {entry.is_dir && (
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadZip(entry.path, entry.name); }}
                        disabled={!!phase}
                        className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors min-w-[72px] justify-center ${
                          phase
                            ? "text-indigo-600 bg-indigo-50 cursor-not-allowed"
                            : "text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {phase === "zipping" ? (
                          <><Loader2 size={11} className="animate-spin" /> Đang nén…</>
                        ) : phase === "downloading" ? (
                          <><Loader2 size={11} className="animate-spin" /> Đang tải…</>
                        ) : (
                          <><Archive size={11} /> ZIP</>
                        )}
                      </button>
                    )}

                    {entry.is_dir && !phase && (
                      <ChevronRight size={13} className="text-gray-300 flex-shrink-0 group-hover:text-indigo-400" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "filter" && <FilterPanel type="rclone" basePath={currentPath} remote={remote} accent="indigo" zipName={dataset.name} datasetId={dataset.id} />}

        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400">ZIP nén toàn bộ folder. File tải trực tiếp qua rclone.</p>
        </div>
      </div>
    </div>
  );
}
