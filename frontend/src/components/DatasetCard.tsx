import { useNavigate } from "react-router-dom";
import { Database, Clock, User, GitCommit, ChevronRight, FileStack } from "lucide-react";
import type { Dataset } from "../types";
import { formatBytes, formatDate } from "../utils";

interface DatasetCardProps {
  dataset: Dataset;
  showProject?: boolean;
}

export function DatasetCard({ dataset, showProject = false }: DatasetCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
      onClick={() => navigate(`/datasets/${dataset.project_id}/${dataset.name}`)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
            <Database size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {dataset.name}
            </h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{dataset.dvc_file}</p>
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 mt-1 transition-colors" />
      </div>

      {showProject && dataset.project_name && (
        <div className="mt-3">
          <span className="inline-flex items-center text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
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
        {dataset.md5 && (
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

      {dataset.last_commit_message && (
        <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 line-clamp-1">
          {dataset.last_commit_message}
        </p>
      )}
    </div>
  );
}
