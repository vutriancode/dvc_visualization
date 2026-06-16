import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Clock, User, GitCommit, ChevronRight, FileStack, Terminal, FolderOpen, ServerCrash, Download, Cloud } from "lucide-react";
import type { Dataset } from "../types";
import { formatBytes, formatDate } from "../utils";
import { DownloadModal } from "./DownloadModal";
import { SSHDownloadModal } from "./SSHDownloadModal";
import { RcloneDownloadModal } from "./RcloneDownloadModal";

interface DatasetCardProps {
  dataset: Dataset;
  showProject?: boolean;
  branch?: string;
}

export function DatasetCard({ dataset, showProject = false, branch }: DatasetCardProps) {
  const navigate = useNavigate();
  const [showDownload, setShowDownload] = useState(false);
  const isSSH = dataset.source_type === "ssh";
  const isRclone = dataset.source_type === "rclone";

  return (
    <>
      {showDownload && !isSSH && !isRclone && (
        <DownloadModal dataset={dataset} branch={branch} onClose={() => setShowDownload(false)} />
      )}

      {showDownload && isSSH && (
        <SSHDownloadModal dataset={dataset} onClose={() => setShowDownload(false)} />
      )}
      {showDownload && isRclone && (
        <RcloneDownloadModal dataset={dataset} onClose={() => setShowDownload(false)} />
      )}
    <div
      className={`bg-white rounded-xl border p-5 transition-all group ${
        isSSH    ? "border-amber-200 hover:border-amber-400 hover:shadow-md cursor-default"
        : isRclone ? "border-indigo-200 hover:border-indigo-400 hover:shadow-md cursor-default"
        : "border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer"
      }`}
      onClick={() => !isSSH && !isRclone && navigate(`/datasets/${dataset.project_id}/${dataset.name}`)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${
            isSSH ? "bg-amber-50 text-amber-600"
            : isRclone ? "bg-indigo-50 text-indigo-600"
            : "bg-blue-50 text-blue-600"
          }`}>
            {isSSH ? <ServerCrash size={18} /> : isRclone ? <Cloud size={18} /> : <Database size={18} />}
          </div>
          <div>
            <h3 className={`font-semibold text-gray-900 transition-colors ${
              isSSH ? "group-hover:text-amber-600"
              : isRclone ? "group-hover:text-indigo-600"
              : "group-hover:text-blue-600"
            }`}>
              {dataset.name}
            </h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[200px]">
              {isSSH || isRclone ? dataset.path : dataset.dvc_file}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          {(isSSH || isRclone) ? (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setShowDownload(true); }}
                className={`p-1.5 rounded-lg text-gray-300 transition-colors opacity-0 group-hover:opacity-100 ${
                  isSSH ? "hover:text-amber-600 hover:bg-amber-50" : "hover:text-indigo-600 hover:bg-indigo-50"
                }`}
                title="Browse & download files"
              >
                <Download size={15} />
              </button>
              {isSSH ? (
                <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium">
                  <FolderOpen size={10} /> SSH
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                  <Cloud size={10} /> {dataset.project_name}
                </span>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDownload(true); }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                title="DVC pull"
              >
                <Terminal size={15} />
              </button>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
            </>
          )}
        </div>
      </div>

      {showProject && dataset.project_name && (
        <div className="mt-3">
          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
            isSSH ? "bg-amber-50 text-amber-600"
            : isRclone ? "bg-indigo-50 text-indigo-600"
            : "bg-purple-50 text-purple-600"
          }`}>
            {dataset.project_name}
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
        {dataset.size !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400 text-xs">Size</span>
            <span className="font-medium">{formatBytes(dataset.size)}</span>
          </div>
        )}
        {dataset.nfiles !== null && dataset.nfiles !== undefined && (
          <div className="flex items-center gap-1.5">
            <FileStack size={13} className="text-gray-400" />
            <span className="font-medium">{dataset.nfiles.toLocaleString()} file{dataset.nfiles !== 1 ? "s" : ""}</span>
          </div>
        )}
        {!isSSH && !isRclone && dataset.md5 && (
          <div className="flex items-center gap-1.5 col-span-2">
            <GitCommit size={13} className="text-gray-400" />
            <span className="font-mono text-xs text-gray-500 truncate">{dataset.md5.slice(0, 16)}…</span>
          </div>
        )}
        {dataset.last_author && (
          <div className="flex items-center gap-1.5">
            <User size={13} className="text-gray-400" />
            <span className="text-xs">{dataset.last_author}</span>
          </div>
        )}
        {dataset.last_modified && (
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-gray-400" />
            <span className="text-xs">{formatDate(dataset.last_modified)}</span>
          </div>
        )}
      </div>

      {!isSSH && !isRclone && dataset.last_commit_message && (
        <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 line-clamp-1">
          {dataset.last_commit_message}
        </p>
      )}
    </div>
    </>
  );
}
