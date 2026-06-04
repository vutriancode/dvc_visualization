import { GitCommit, User, Clock } from "lucide-react";
import type { DatasetVersion } from "../types";
import { formatBytes, formatDate } from "../utils";

interface VersionTimelineProps {
  versions: DatasetVersion[];
}

export function VersionTimeline({ versions }: VersionTimelineProps) {
  if (versions.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No version history found.</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
      <div className="space-y-0">
        {versions.map((version, idx) => (
          <div key={version.commit_id} className="relative flex gap-4 pb-6 last:pb-0">
            <div
              className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                idx === 0 ? "bg-blue-600 text-white" : "bg-white border-2 border-gray-300 text-gray-400"
              }`}
            >
              <GitCommit size={14} />
            </div>

            <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {version.commit_short}
                  </span>
                  {idx === 0 && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-medium">
                      latest
                    </span>
                  )}
                </div>
                {version.size !== null && (
                  <span className="text-xs text-gray-500 font-medium">{formatBytes(version.size)}</span>
                )}
              </div>

              <p className="mt-2 text-sm text-gray-800 font-medium line-clamp-2">{version.message}</p>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <User size={11} />
                  {version.author}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatDate(version.authored_date)}
                </span>
                {version.md5 && (
                  <span className="font-mono text-gray-400">md5: {version.md5.slice(0, 12)}…</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
