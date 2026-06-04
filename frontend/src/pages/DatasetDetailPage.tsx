import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Database, GitCommit, HardDrive, RefreshCw } from "lucide-react";
import { useDatasetDetail } from "../hooks/useDatasets";
import { VersionTimeline } from "../components/VersionTimeline";
import { formatBytes, formatDate } from "../utils";

export function DatasetDetailPage() {
  const { projectId, name } = useParams<{ projectId: string; name: string }>();
  const navigate = useNavigate();
  const { data: dataset, isLoading, error } = useDatasetDetail(projectId, name);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Database size={18} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">{name}</h1>
              {dataset && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                    {dataset.project_name}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{dataset.dvc_file}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading && (
          <div className="text-center py-16 text-gray-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
            <p>Loading dataset details…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            Failed to load dataset.
          </div>
        )}

        {dataset && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Dataset Info</h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-400 uppercase tracking-wide">Path</dt>
                    <dd className="font-mono text-gray-800 mt-0.5 break-all">{dataset.path}</dd>
                  </div>
                  {dataset.size !== null && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <HardDrive size={11} /> Size
                      </dt>
                      <dd className="font-medium text-gray-800 mt-0.5">{formatBytes(dataset.size)}</dd>
                    </div>
                  )}
                  {dataset.md5 && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <GitCommit size={11} /> MD5
                      </dt>
                      <dd className="font-mono text-xs text-gray-600 mt-0.5 break-all">{dataset.md5}</dd>
                    </div>
                  )}
                  {dataset.last_author && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide">Last updated by</dt>
                      <dd className="text-gray-800 mt-0.5">{dataset.last_author}</dd>
                    </div>
                  )}
                  {dataset.last_modified && (
                    <div>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide">Last modified</dt>
                      <dd className="text-gray-800 mt-0.5">{formatDate(dataset.last_modified)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {dataset.last_commit_message && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">Last Commit</h2>
                  <p className="text-sm text-gray-600">{dataset.last_commit_message}</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 mb-5">
                  Version History
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {dataset.versions.length} commits
                  </span>
                </h2>
                <VersionTimeline versions={dataset.versions} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
