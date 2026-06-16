import { useState, useEffect } from "react";
import { X, FolderOpen, Download, Loader2, ChevronRight, ArrowLeft, Archive } from "lucide-react";
import { useSSHBrowse } from "../hooks/useConfig";
import type { Dataset } from "../types";
import { formatBytes } from "../utils";
import { FilterPanel } from "./FilterPanel";
import * as downloadStore from "../store/downloads";

interface Props {
  dataset: Dataset;
  onClose: () => void;
}

type ZipPhase = "zipping" | "downloading";

export function SSHDownloadModal({ dataset, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState(dataset.path);
  const [tab, setTab] = useState<"browse" | "filter">("browse");

  // Sync browse-mode ZIP state from global store (so indicator persists after modal closes)
  const [zipStates, setZipStates] = useState<Map<string, ZipPhase>>(new Map());
  useEffect(() => downloadStore.subscribe(() => {
    const tasks = downloadStore.getTasksForDataset(dataset.id);
    setZipStates(new Map(tasks.map(t => [t.filename, t.phase])));
  }), [dataset.id]);

  const { data, isLoading, error } = useSSHBrowse(currentPath);

  const breadcrumbs = currentPath.split("/").filter(Boolean);
  const rootPath = dataset.path;

  const navigate = (path: string) => setCurrentPath(path);

  const goUp = () => {
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    if (parent.length < rootPath.length) return;
    navigate(parent);
  };

  const fileDownloadUrl = (filePath: string, fileName: string) =>
    `/api/storage/ssh/download-path?path=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName)}`;

  const folderDownloadUrl = (folderPath: string, folderName: string) =>
    `/api/storage/ssh/download-folder?path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(folderName)}`;

  const downloadZip = (folderPath: string, folderName: string) => {
    const filename = `${folderName}.zip`;
    if (downloadStore.getTasksForDataset(dataset.id).some(t => t.filename === filename)) return;
    downloadStore.startDownload(dataset.id, filename, () =>
      fetch(folderDownloadUrl(folderPath, folderName))
    ).catch(err => console.error("ZIP download failed:", err));
  };

  const currentFolderName = currentPath.split("/").filter(Boolean).pop() || "folder";
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
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Download size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{dataset.name}</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[200px]">{currentPath}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadZip(currentPath, currentFolderName)}
              disabled={!!headerPhase}
              className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-80 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors font-medium min-w-[80px] justify-center"
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
                tab === t ? "border-b-2 border-amber-500 text-amber-700" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "browse" ? "Duyệt" : "Lọc file"}
            </button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            {/* Breadcrumb */}
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1 flex-wrap flex-shrink-0">
              {currentPath !== rootPath && (
                <button onClick={goUp}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors mr-1">
                  <ArrowLeft size={12} /> Back
                </button>
              )}
              {breadcrumbs.map((seg, i) => {
                const path = "/" + breadcrumbs.slice(0, i + 1).join("/");
                const isBeforeRoot = path.length < rootPath.length;
                return (
                  <span key={path} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={11} className="text-gray-300" />}
                    <button
                      onClick={() => !isBeforeRoot && navigate(path)}
                      disabled={isBeforeRoot}
                      className={`text-xs transition-colors ${
                        path === currentPath ? "text-gray-700 font-medium"
                        : isBeforeRoot ? "text-gray-300 cursor-default"
                        : "text-blue-600 hover:underline"
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
                <div className="text-center py-10 text-gray-400 text-sm">Empty directory</div>
              )}
              {data && data.entries.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {data.entries.map((entry) => {
                    const phase = zipStates.get(`${entry.name}.zip`);
                    return (
                      <div key={entry.path}
                        className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors group">
                        <FolderOpen
                          size={15}
                          className={`flex-shrink-0 ${entry.is_dir ? "text-amber-500" : "text-gray-300"}`}
                        />
                        {entry.is_dir ? (
                          <button onClick={() => navigate(entry.path)}
                            className="flex-1 text-sm text-left text-gray-800 hover:text-blue-600 transition-colors truncate">
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
                            className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
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
                                ? "text-amber-600 bg-amber-50 cursor-not-allowed"
                                : "text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100"
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
                          <ChevronRight size={13} className="text-gray-300 flex-shrink-0 group-hover:text-blue-400" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {tab === "filter" && <FilterPanel type="ssh" basePath={currentPath} accent="amber" zipName={dataset.name} datasetId={dataset.id} />}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-400">
            ZIP nén toàn bộ folder. File tải trực tiếp từ SSH.
          </p>
        </div>
      </div>
    </div>
  );
}
