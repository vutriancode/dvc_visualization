import { useState, useRef } from "react";
import {
  X, Database, Upload, CheckCircle, Loader2, FolderOpen,
  PlusCircle, AlertCircle, GitBranch, Folder,
} from "lucide-react";
import { useProjects } from "../hooks/useConfig";
import { formatBytes } from "../utils";

interface FileEntry {
  file: File;
  relativePath: string; // path inside the dataset, e.g. "images/cat.jpg"
}

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

type RepoMode = "existing" | "custom" | "new";
type Step = "idle" | "loading" | "done" | "error";

interface CreateResult {
  repo_path: string;
  dataset_name: string;
  dvc_file: string;
  nfiles: number;
  size: number;
  new_repo_created: boolean;
  commit_id: string;
  branch: string;
}

export function CreateDVCDatasetModal({ onClose, onCreated }: Props) {
  const { data: projects } = useProjects();

  const [projectId, setProjectId] = useState("");
  const [repoMode, setRepoMode] = useState<RepoMode>("existing");
  const [customRepoPath, setCustomRepoPath] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [namespacePath, setNamespacePath] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [branch, setBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects?.find((p) => p.id === projectId);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming: FileEntry[] = Array.from(list).map((f) => ({
      file: f,
      relativePath: f.name,
    }));
    setFiles((prev) => {
      const existing = new Set(prev.map((e) => e.relativePath));
      return [...prev, ...incoming.filter((e) => !existing.has(e.relativePath))];
    });
  };

  const addFolder = (list: FileList | null) => {
    if (!list) return;
    const incoming: FileEntry[] = Array.from(list).map((f) => {
      // webkitRelativePath = "rootFolder/subdir/file.txt" → strip root folder name
      const parts = f.webkitRelativePath ? f.webkitRelativePath.split("/") : [f.name];
      const relativePath = parts.length > 1 ? parts.slice(1).join("/") : f.name;
      return { file: f, relativePath };
    });
    setFiles((prev) => {
      const existing = new Set(prev.map((e) => e.relativePath));
      return [...prev, ...incoming.filter((e) => !existing.has(e.relativePath))];
    });
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const getRepoPath = () => {
    if (repoMode === "existing") return selectedProject?.project_path ?? "";
    if (repoMode === "custom") return customRepoPath.trim();
    return newRepoName.trim();
  };

  const isValid =
    !!projectId &&
    !!datasetName.trim() &&
    files.length > 0 &&
    (repoMode === "existing"
      ? !!selectedProject?.project_path
      : repoMode === "custom"
      ? !!customRepoPath.trim()
      : !!newRepoName.trim());

  const handleSubmit = async () => {
    if (!isValid || step === "loading") return;
    setError(null);
    setStep("loading");

    const form = new FormData();
    form.append("project_id", projectId);
    form.append("repo_path", getRepoPath());
    form.append("dataset_name", datasetName.trim());
    form.append("create_new_repo", repoMode === "new" ? "true" : "false");
    form.append("namespace_path", namespacePath.trim());
    form.append("branch", branch || "main");
    form.append("commit_message", commitMessage.trim());
    for (const entry of files) {
      form.append("files", entry.file, entry.relativePath);
    }

    try {
      const resp = await fetch("/api/datasets/create-dvc", { method: "POST", body: form });
      if (!resp.ok) {
        let detail = resp.statusText;
        try { detail = (await resp.json()).detail ?? detail; } catch {}
        throw new Error(detail);
      }
      const data: CreateResult = await resp.json();
      setResult(data);
      setStep("done");
      onCreated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <PlusCircle size={16} />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">Tạo dataset DVC mới</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Success ── */}
          {step === "done" && result && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle size={44} className="text-green-500" />
              <p className="font-semibold text-gray-900 text-base">Dataset đã được tạo!</p>
              <div className="text-xs text-gray-500 space-y-1">
                <p>
                  Repo:{" "}
                  <span className="font-mono text-gray-800">{result.repo_path}</span>
                </p>
                <p>
                  File:{" "}
                  <span className="font-mono text-gray-800">{result.dvc_file}</span>
                </p>
                <p>
                  {result.nfiles} file · {formatBytes(result.size)} · nhánh{" "}
                  <span className="font-mono">{result.branch}</span>
                </p>
                {result.new_repo_created && (
                  <p className="text-blue-600 font-medium mt-1">
                    Repo mới đã được tạo và thêm vào cấu hình tự động!
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
              >
                Đóng
              </button>
            </div>
          )}

          {step !== "done" && (
            <>
              {/* GitLab connection */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  Kết nối GitLab <span className="text-red-400">*</span>
                </label>
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setRepoMode("existing");
                    setCustomRepoPath("");
                    setNewRepoName("");
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white"
                >
                  <option value="">— Chọn kết nối GitLab —</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.project_path}
                      {p.source_type === "group" ? " (group)" : ""} — {p.gitlab_url}
                    </option>
                  ))}
                </select>
              </div>

              {/* Repo target */}
              {selectedProject && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                    Repo GitLab <span className="text-red-400">*</span>
                  </label>
                  <div className="space-y-2">
                    {/* Option: use configured project repo */}
                    {selectedProject.source_type === "project" && (
                      <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                          type="radio"
                          name="repoMode"
                          checked={repoMode === "existing"}
                          onChange={() => setRepoMode("existing")}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">Dùng repo đã cấu hình</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">
                            {selectedProject.project_path}
                          </p>
                        </div>
                      </label>
                    )}

                    {/* Option: enter repo path manually */}
                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="repoMode"
                        checked={repoMode === "custom"}
                        onChange={() => setRepoMode("custom")}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Nhập đường dẫn repo</p>
                        {repoMode === "custom" && (
                          <input
                            type="text"
                            value={customRepoPath}
                            onChange={(e) => setCustomRepoPath(e.target.value)}
                            placeholder="namespace/ten-repo"
                            autoFocus
                            className="mt-1.5 w-full text-xs font-mono border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                          />
                        )}
                      </div>
                    </label>

                    {/* Option: create new repo */}
                    <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="repoMode"
                        checked={repoMode === "new"}
                        onChange={() => setRepoMode("new")}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">Tạo repo GitLab mới</p>
                        {repoMode === "new" && (
                          <div className="mt-1.5 space-y-1.5">
                            <input
                              type="text"
                              value={newRepoName}
                              onChange={(e) => setNewRepoName(e.target.value)}
                              placeholder="Tên repo (ví dụ: my-data-repo)"
                              autoFocus
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                            <input
                              type="text"
                              value={namespacePath}
                              onChange={(e) => setNamespacePath(e.target.value)}
                              placeholder="Namespace / group (tùy chọn)"
                              className="w-full text-xs font-mono border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-1.5 leading-relaxed">
                              Nếu tạo repo thất bại (403), hãy tạo repo thủ công trên GitLab rồi chọn "Nhập đường dẫn repo".
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Dataset info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                    Tên dataset <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) =>
                      setDatasetName(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, "_"))
                    }
                    placeholder="my_dataset"
                    className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block flex items-center gap-1">
                    <GitBranch size={11} /> Nhánh
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full text-sm font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  Commit message{" "}
                  <span className="text-gray-400 font-normal">(tùy chọn)</span>
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder={
                    datasetName ? `Add dataset ${datasetName} via DVC` : "Add dataset via DVC"
                  }
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* File / folder upload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-700">
                    Files <span className="text-red-400">*</span>
                  </label>
                  {files.length > 0 && (
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-xl px-4 py-5 text-center select-none transition-colors ${
                    dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Upload size={12} /> Chọn files
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Folder size={12} /> Chọn folder
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">hoặc kéo thả files vào đây</p>
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  <input ref={folderInputRef} type="file" className="hidden"
                    /* @ts-expect-error webkitdirectory is non-standard */
                    webkitdirectory=""
                    onChange={(e) => { addFolder(e.target.files); e.target.value = ""; }} />
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {files.length} file · {formatBytes(files.reduce((s, e) => s + e.file.size, 0))}
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                      {files.slice(0, 50).map((entry, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 text-xs">
                          <FolderOpen size={11} className="text-gray-300 flex-shrink-0" />
                          <span className="flex-1 truncate text-gray-700 font-mono">{entry.relativePath}</span>
                          <span className="text-gray-400 flex-shrink-0 tabular-nums">{formatBytes(entry.file.size)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      {files.length > 50 && (
                        <div className="px-3 py-1.5 text-xs text-gray-400 italic bg-gray-50">
                          ... và {files.length - 50} file khác
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Loading */}
              {step === "loading" && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 rounded-lg border border-blue-100">
                  <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">Đang tạo dataset…</p>
                    <p className="text-xs text-blue-500 mt-0.5">
                      Upload {files.length} file ({formatBytes(files.reduce((s, e) => s + e.file.size, 0))}) lên MinIO và commit .dvc metadata lên GitLab
                    </p>
                  </div>
                </div>
              )}

              {/* Error */}
              {step === "error" && error && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 rounded-lg border border-red-100">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-700 mb-1">Tạo dataset thất bại</p>
                    {error.split("\n").map((line, i) => (
                      <p key={i} className="text-xs text-red-600 break-words leading-relaxed">{line}</p>
                    ))}
                    {/* Quick fix hint for repo-creation 403 */}
                    {(error.includes("403") || error.includes("tạo project") || error.includes("tạo repo")) && repoMode === "new" && (
                      <button
                        onClick={() => { setRepoMode("custom"); setStep("idle"); setError(null); }}
                        className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        → Chuyển sang nhập đường dẫn repo thủ công
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== "done" && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-gray-400">
              Files → MinIO · Metadata .dvc → GitLab
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid || step === "loading"}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {step === "loading" ? (
                  <><Loader2 size={13} className="animate-spin" /> Đang tạo…</>
                ) : (
                  <><Database size={13} /> Tạo dataset</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
