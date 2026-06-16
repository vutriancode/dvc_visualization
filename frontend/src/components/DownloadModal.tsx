import { useState } from "react";
import { X, Terminal, Copy, Check, ExternalLink } from "lucide-react";
import type { Dataset } from "../types";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors px-2 py-1 rounded hover:bg-blue-50"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-lg px-4 py-3 text-xs font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

interface Props {
  dataset: Dataset;
  branch?: string;
  onClose: () => void;
}

export function DownloadModal({ dataset, branch, onClose }: Props) {
  const repoName = dataset.repo_path.split("/").pop() ?? dataset.name;
  const gitCloneUrl = dataset.gitlab_url && dataset.repo_path
    ? `${dataset.gitlab_url}/${dataset.repo_path}.git`
    : null;

  const branchFlag = branch ? ` -b ${branch}` : "";
  const cloneCmd   = gitCloneUrl ? `git clone${branchFlag} ${gitCloneUrl}` : null;
  const pullCmd    = `cd ${repoName}\ndvc pull`;
  const fullCmd    = cloneCmd ? `${cloneCmd}\n${pullCmd}` : pullCmd;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Terminal size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">DVC Pull</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{dataset.repo_path}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {cloneCmd && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">1. Clone repository</p>
              <CodeBlock code={cloneCmd} />
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">
              {cloneCmd ? "2. Pull all data" : "Pull all data"}
            </p>
            <CodeBlock code={pullCmd} />
          </div>

          {/* Copy all */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <span className="text-xs text-gray-500">Copy full workflow</span>
            <CopyButton text={fullCmd} />
          </div>

          {/* Prerequisites */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">Prerequisites</p>
            <ul className="list-disc list-inside text-amber-600 space-y-0.5">
              <li>DVC installed: <code className="bg-amber-100 px-1 rounded">pip install dvc[s3]</code></li>
              <li>DVC remote credentials configured</li>
            </ul>
          </div>

          {/* GitLab link */}
          {gitCloneUrl && (
            <a
              href={`${dataset.gitlab_url}/${dataset.repo_path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink size={12} /> Open repository on GitLab
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
