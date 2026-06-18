import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Settings, GitBranch, HardDrive, Eye, EyeOff,
  CheckCircle, XCircle, Loader2, Save, Plus, Trash2, Pencil, X, Layers,
  Terminal, FolderOpen, Link, LogOut, Cloud,
} from "lucide-react";
import { useRedmineConfig, useUpdateRedmineConfig, useTestRedmineConfig } from "../hooks/useRedmine";
import {
  useProjects, useAddProject, useUpdateProject, useDeleteProject, useTestProject,
  useMinioConfig, useUpdateMinio, useTestMinio,
  useSSHConfig, useUpdateSSH, useTestSSH,
  useSSHBrowse, useSSHDatasets, useAddSSHDataset, useDeleteSSHDataset,
  useGDriveConfig, useUpdateGDrive, useGDriveAuthUrl, useGDriveExchangeCode,
  useGDriveDisconnect, useTestGDrive,
} from "../hooks/useConfig";
import {
  useRcloneProviders, useRcloneRemotes, useDeleteRcloneRemote, useTestRcloneRemote,
  useRcloneAuthStart, useRcloneAuthPoll, useRcloneAuthFinish,
  useRcloneBrowse, useRcloneDatasets, useAddRcloneDataset, useDeleteRcloneDataset,
} from "../hooks/useRclone";
import type { RcloneEntry } from "../types";
import type {
  GitLabProjectCreate, GitLabProjectUpdate, GitLabProjectPublic,
  MinIOConfigUpdate, SSHConfigUpdate, GDriveConfigUpdate, SSHEntry,
} from "../types";

// ---- Shared components ----

function SecretInput({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 pr-9"
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ConnectionStatus({ status, message }: { status: "idle" | "loading" | "ok" | "error"; message?: string }) {
  if (status === "idle") return null;
  if (status === "loading") return <span className="flex items-center gap-1 text-xs text-gray-500"><Loader2 size={12} className="animate-spin" /> Testing…</span>;
  if (status === "ok") return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> {message || "Connected"}</span>;
  return <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Connection failed</span>;
}

// ---- Project form (add / edit) ----

function ProjectForm({
  initial, tokenRequired, onSave, onCancel, isSaving,
}: {
  initial: GitLabProjectCreate;
  tokenRequired: boolean;
  onSave: (data: GitLabProjectCreate) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof GitLabProjectCreate) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name && form.gitlab_url && form.project_path && (!tokenRequired || form.gitlab_token);
  const isGroup = form.source_type === "group";

  return (
    <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/40 space-y-4">
      {/* Source type toggle */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, source_type: "project" }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!isGroup ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <GitBranch size={13} /> Project
        </button>
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, source_type: "group" }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isGroup ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <Layers size={13} /> Group / Subgroup
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Display Name" value={form.name} onChange={set("name")} placeholder="My ML Project" />
        <Field label="GitLab URL" value={form.gitlab_url} onChange={set("gitlab_url")} placeholder="https://gitlab.com" />
        <Field
          label={isGroup ? "Group / Subgroup Path" : "Project Path or ID"}
          value={form.project_path}
          onChange={set("project_path")}
          placeholder={isGroup ? "my-group/my-subgroup" : "org/repo or 12345678"}
          hint={isGroup
            ? "Group or subgroup path — all projects inside will be scanned for DVC files"
            : "namespace/project or numeric project ID"}
        />
        <Field
          label="Branch (optional)"
          value={form.branch}
          onChange={set("branch")}
          placeholder="main, master, develop… (empty = repo default)"
          hint="Leave empty to use each repo's default branch"
        />
        <SecretInput
          label={tokenRequired ? "Personal Access Token" : "Personal Access Token (leave empty to keep)"}
          value={form.gitlab_token}
          onChange={set("gitlab_token")}
          placeholder={tokenRequired ? "glpat-xxxxxxxxxxxx" : "••••••• (unchanged)"}
          hint="Requires read_api + read_repository scopes"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!valid || isSaving}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>
    </div>
  );
}

// ---- Projects tab ----

function ProjectsTab() {
  const { data: projects, isLoading } = useProjects();
  const addProject = useAddProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const testProject = useTestProject();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "idle" | "loading" | "ok" | "error">>({});
  const [testMessages, setTestMessages] = useState<Record<string, string>>({});

  const handleAdd = async (data: GitLabProjectCreate) => {
    await addProject.mutateAsync(data);
    setAdding(false);
  };

  const handleUpdate = async (id: string, data: GitLabProjectCreate) => {
    await updateProject.mutateAsync({ id, ...data } as GitLabProjectUpdate & { id: string });
    setEditingId(null);
  };

  const handleTest = async (id: string) => {
    setTestResults(r => ({ ...r, [id]: "loading" }));
    try {
      const result = await testProject.mutateAsync(id);
      setTestResults(r => ({ ...r, [id]: "ok" }));
      setTestMessages(m => ({ ...m, [id]: result.project }));
    } catch {
      setTestResults(r => ({ ...r, [id]: "error" }));
    }
  };

  if (isLoading) return <div className="text-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {projects && projects.length === 0 && !adding && (
        <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <GitBranch size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No projects yet. Add your first GitLab project.</p>
        </div>
      )}

      {projects?.map((project: GitLabProjectPublic) =>
        editingId === project.id ? (
          <ProjectForm
            key={project.id}
            initial={{ name: project.name, gitlab_url: project.gitlab_url, gitlab_token: "", project_path: project.project_path, source_type: project.source_type ?? "project", branch: project.branch ?? "" }}
            tokenRequired={false}
            onSave={(data) => handleUpdate(project.id, data)}
            onCancel={() => setEditingId(null)}
            isSaving={updateProject.isPending}
          />
        ) : (
          <div key={project.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-4 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900">{project.name}</span>
                {project.source_type === "group"
                  ? <span className="flex items-center gap-1 text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded"><Layers size={10} /> group</span>
                  : <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded"><GitBranch size={10} /> project</span>
                }
                {project.token_set
                  ? <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">token set</span>
                  : <span className="text-xs bg-red-50 text-red-500 px-1.5 py-0.5 rounded">no token</span>
                }
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{project.gitlab_url} / {project.project_path}</p>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => handleTest(project.id)}
                  className="text-xs text-blue-600 hover:underline">Test connection</button>
                <ConnectionStatus
                  status={testResults[project.id] ?? "idle"}
                  message={testMessages[project.id]}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => setEditingId(project.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={() => deleteProject.mutate(project.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )
      )}

      {adding ? (
        <ProjectForm
          initial={{ name: "", gitlab_url: "https://gitlab.com", gitlab_token: "", project_path: "", source_type: "project", branch: "" }}
          tokenRequired={true}
          onSave={handleAdd}
          onCancel={() => setAdding(false)}
          isSaving={addProject.isPending}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={15} /> Add GitLab Project
        </button>
      )}
    </div>
  );
}

// ---- MinIO tab ----

function MinIOTab() {
  const { data: minio, isLoading } = useMinioConfig();
  const updateMinio = useUpdateMinio();
  const testMinio = useTestMinio();

  const [form, setForm] = useState<MinIOConfigUpdate>({});
  const [saved, setSaved] = useState(false);

  const set = (k: keyof MinIOConfigUpdate) => (v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    await updateMinio.mutateAsync(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testStatus = testMinio.isPending ? "loading" : testMinio.isSuccess ? "ok" : testMinio.isError ? "error" : "idle";

  if (isLoading) return <div className="text-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Endpoint"
          value={form.endpoint ?? minio?.endpoint ?? ""}
          onChange={set("endpoint")}
          placeholder="localhost:9000"
          hint="Without http:// prefix"
        />
        <Field
          label="Bucket"
          value={form.bucket ?? minio?.bucket ?? "dvc"}
          onChange={set("bucket")}
          placeholder="dvc"
        />
        <Field
          label="Access Key"
          value={form.access_key ?? minio?.access_key ?? ""}
          onChange={set("access_key")}
          placeholder="minioadmin"
        />
        <SecretInput
          label="Secret Key"
          value={form.secret_key ?? ""}
          onChange={set("secret_key")}
          placeholder={minio?.secret_key_set ? "••••••• (leave empty to keep)" : "your-secret-key"}
          hint={minio?.secret_key_set ? "Secret is set. Leave empty to keep existing." : undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <input id="use-ssl" type="checkbox"
          checked={form.use_ssl ?? minio?.use_ssl ?? false}
          onChange={(e) => set("use_ssl")(e.target.checked)}
          className="rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="use-ssl" className="text-xs text-gray-600">Use SSL (HTTPS)</label>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-4">
          <button onClick={() => testMinio.mutate()} disabled={testMinio.isPending}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50">
            Test connection
          </button>
          <ConnectionStatus status={testStatus as "idle" | "loading" | "ok" | "error"} />
          {testMinio.isSuccess && (
            <span className="text-xs text-green-600">
              Bucket "{testMinio.data?.bucket}" {testMinio.data?.bucket_exists ? "exists" : "— not found"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> Saved</span>}
          <button onClick={handleSave} disabled={updateMinio.isPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            {updateMinio.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SSH folder browser sub-component ──────────────────────────────────────────

function SSHFolderBrowser({ onAdd }: { onAdd: (path: string, name: string) => void }) {
  const [currentPath, setCurrentPath] = useState("/");
  const [browsePath, setBrowsePath] = useState<string | null>(null);
  const { data, isLoading, error } = useSSHBrowse(browsePath);

  const [pendingName, setPendingName] = useState<{ path: string; value: string } | null>(null);

  const navigate = (path: string) => {
    setBrowsePath(path);
    setCurrentPath(path);
  };

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  const handleAdd = (entry: SSHEntry) => {
    setPendingName({ path: entry.path, value: entry.name });
  };

  const confirmAdd = () => {
    if (!pendingName || !pendingName.value.trim()) return;
    onAdd(pendingName.path, pendingName.value.trim());
    setPendingName(null);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => navigate("/")}
          disabled={isLoading}
          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
        >
          /
        </button>
        {breadcrumbs.map((seg, i) => {
          const path = "/" + breadcrumbs.slice(0, i + 1).join("/");
          return (
            <span key={path} className="flex items-center gap-1">
              <span className="text-gray-300 text-xs">/</span>
              <button
                onClick={() => navigate(path)}
                disabled={isLoading}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {seg}
              </button>
            </span>
          );
        })}
        {browsePath === null && (
          <button
            onClick={() => navigate("/")}
            className="ml-auto flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FolderOpen size={12} /> Browse
          </button>
        )}
        {isLoading && <Loader2 size={13} className="animate-spin text-blue-500 ml-auto" />}
      </div>

      {/* Entry list */}
      {error && (
        <div className="px-4 py-3 text-xs text-red-600 bg-red-50">
          {String((error as Error).message)}
        </div>
      )}

      {data && (
        <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {/* Parent dir */}
          {currentPath !== "/" && (
            <button
              onClick={() => {
                const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
                navigate(parent);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors text-left"
            >
              <FolderOpen size={14} className="text-gray-300" />
              ..
            </button>
          )}
          {data.entries.length === 0 && (
            <p className="px-4 py-4 text-xs text-gray-400 text-center">Empty directory</p>
          )}
          {data.entries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors group">
              <FolderOpen
                size={14}
                className={entry.is_dir ? "text-amber-500 flex-shrink-0" : "text-gray-300 flex-shrink-0"}
              />
              {entry.is_dir ? (
                <button
                  onClick={() => navigate(entry.path)}
                  className="flex-1 text-sm text-left text-gray-800 hover:text-blue-600 transition-colors truncate"
                >
                  {entry.name}
                </button>
              ) : (
                <span className="flex-1 text-sm text-gray-500 truncate">{entry.name}</span>
              )}
              {entry.is_dir && (
                <button
                  onClick={() => handleAdd(entry)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Plus size={11} /> Save as dataset
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {browsePath === null && !error && (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          Click Browse to explore the SSH server
        </div>
      )}

      {/* Name prompt */}
      {pendingName && (
        <div className="border-t border-gray-200 bg-blue-50 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 flex-shrink-0 font-mono truncate max-w-[180px]">{pendingName.path}</span>
          <input
            autoFocus
            type="text"
            value={pendingName.value}
            onChange={e => setPendingName(p => p ? { ...p, value: e.target.value } : null)}
            onKeyDown={e => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") setPendingName(null); }}
            placeholder="Dataset name…"
            className="flex-1 min-w-[140px] px-2 py-1.5 rounded border border-blue-300 text-sm focus:outline-none focus:border-blue-500"
          />
          <button onClick={confirmAdd}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            <Save size={11} /> Save
          </button>
          <button onClick={() => setPendingName(null)}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---- SSH tab ----

function SSHTab() {
  const { data: ssh, isLoading } = useSSHConfig();
  const updateSSH = useUpdateSSH();
  const testSSH = useTestSSH();
  const { data: datasets } = useSSHDatasets();
  const addDataset = useAddSSHDataset();
  const deleteDataset = useDeleteSSHDataset();

  const [form, setForm] = useState<SSHConfigUpdate>({});
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const set = (k: keyof SSHConfigUpdate) => (v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    await updateSSH.mutateAsync(form);
    setSaved(true);
    setForm({});
    setTimeout(() => setSaved(false), 2500);
  };

  const handleTest = async () => {
    try {
      await testSSH.mutateAsync();
      setIsConnected(true);
    } catch {
      setIsConnected(false);
    }
  };

  const testStatus = testSSH.isPending ? "loading" : testSSH.isSuccess ? "ok" : testSSH.isError ? "error" : "idle";
  const canBrowse = isConnected || (ssh?.host && ssh?.username);

  if (isLoading) return <div className="text-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-5">
      {/* ── Connection config ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Connection</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Host" value={form.host ?? ssh?.host ?? ""} onChange={set("host")}
            placeholder="192.168.1.10 or server.example.com" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
            <input type="number" value={form.port ?? ssh?.port ?? 22}
              onChange={e => set("port")(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
          </div>
          <Field label="Username" value={form.username ?? ssh?.username ?? ""}
            onChange={set("username")} placeholder="ubuntu" />
          <SecretInput
            label={ssh?.password_set ? "Password (leave empty to keep)" : "Password"}
            value={form.password ?? ""}
            onChange={set("password")}
            placeholder={ssh?.password_set ? "••••••• (unchanged)" : "optional if using private key"}
          />
        </div>

        {/* Private key */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">
              Private Key (PEM)
              {ssh?.private_key_set && <span className="ml-2 text-green-600 font-normal">— key set</span>}
            </label>
            <button type="button" onClick={() => setShowKey(s => !s)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <textarea
            rows={showKey ? 5 : 1}
            value={form.private_key_pem ?? ""}
            onChange={e => set("private_key_pem")(e.target.value)}
            placeholder={ssh?.private_key_set ? "Leave empty to keep existing key" : "-----BEGIN RSA PRIVATE KEY-----"}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-mono focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <button onClick={handleTest} disabled={testSSH.isPending}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50">
              Test connection
            </button>
            <ConnectionStatus status={testStatus as "idle" | "loading" | "ok" | "error"}
              message={testSSH.isSuccess ? `Connected to ${testSSH.data?.host}` : undefined} />
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> Saved</span>}
            <button onClick={handleSave} disabled={updateSSH.isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {updateSSH.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* ── Folder browser (shown when host+user configured) ── */}
      {canBrowse && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Browse &amp; Add Datasets</h3>
          <SSHFolderBrowser
            onAdd={(path, name) => addDataset.mutate({ path, name })}
          />
          {addDataset.isSuccess && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={11} /> Dataset saved
            </p>
          )}
        </div>
      )}

      {/* ── Saved SSH datasets ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Saved Datasets
          {datasets && datasets.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {datasets.length}
            </span>
          )}
        </h3>

        {(!datasets || datasets.length === 0) ? (
          <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl text-sm">
            No SSH datasets yet. Browse and add a folder above.
          </div>
        ) : (
          <div className="space-y-2">
            {datasets.map(ds => (
              <div key={ds.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <FolderOpen size={16} className="text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{ds.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{ds.path}</p>
                </div>
                <button onClick={() => deleteDataset.mutate(ds.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Google Drive tab ----

function GDriveTab() {
  const { data: gdrive, isLoading } = useGDriveConfig();
  const updateGDrive = useUpdateGDrive();
  const getAuthUrl = useGDriveAuthUrl();
  const exchangeCode = useGDriveExchangeCode();
  const disconnect = useGDriveDisconnect();
  const testGDrive = useTestGDrive();

  const [form, setForm] = useState<GDriveConfigUpdate>({});
  const [saved, setSaved] = useState(false);

  const set = (k: keyof GDriveConfigUpdate) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  // Detect OAuth callback: ?code=xxx in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Clean code from URL immediately
    const clean = window.location.origin + window.location.pathname;
    window.history.replaceState({}, "", clean);
    // Exchange code
    exchangeCode.mutate({ code, redirectUri: clean });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    await updateGDrive.mutateAsync(form);
    setSaved(true);
    setForm({});
    setTimeout(() => setSaved(false), 2500);
  };

  const handleConnect = async () => {
    const redirectUri = window.location.origin + window.location.pathname;
    const result = await getAuthUrl.mutateAsync(redirectUri);
    window.location.href = result.url;
  };

  const testStatus = testGDrive.isPending ? "loading" : testGDrive.isSuccess ? "ok" : testGDrive.isError ? "error" : "idle";

  if (isLoading) return <div className="text-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      {/* OAuth callback processing */}
      {exchangeCode.isPending && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          <Loader2 size={14} className="animate-spin" /> Connecting to Google Drive…
        </div>
      )}
      {exchangeCode.isSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          <CheckCircle size={14} /> Successfully connected to Google Drive!
        </div>
      )}
      {exchangeCode.isError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <XCircle size={14} /> Failed to connect: {String((exchangeCode.error as Error)?.message ?? "Unknown error")}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        {/* Connection status badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {gdrive?.connected
              ? <span className="flex items-center gap-1.5 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium"><CheckCircle size={12} /> Connected</span>
              : <span className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">Not connected</span>
            }
          </div>
          {gdrive?.connected && (
            <div className="flex items-center gap-3">
              <button onClick={() => testGDrive.mutate()} disabled={testGDrive.isPending}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                Test
              </button>
              <ConnectionStatus status={testStatus as "idle" | "loading" | "ok" | "error"}
                message={testGDrive.isSuccess ? `${testGDrive.data?.email} · ${testGDrive.data?.folder}` : undefined} />
              <button onClick={() => disconnect.mutate()}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Google Drive Folder ID"
            value={form.folder_id ?? gdrive?.folder_id ?? ""}
            onChange={set("folder_id")}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
            hint="ID from the Drive folder URL: drive.google.com/drive/folders/{ID}"
          />
          <Field
            label="OAuth Client ID"
            value={form.client_id ?? gdrive?.client_id ?? ""}
            onChange={set("client_id")}
            placeholder="xxxx.apps.googleusercontent.com"
            hint="From Google Cloud Console → APIs & Services → Credentials"
          />
          <SecretInput
            label={gdrive?.client_secret_set ? "Client Secret (leave empty to keep)" : "Client Secret"}
            value={form.client_secret ?? ""}
            onChange={set("client_secret")}
            placeholder={gdrive?.client_secret_set ? "••••••• (unchanged)" : "GOCSPX-..."}
          />
        </div>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
          <button
            onClick={handleConnect}
            disabled={getAuthUrl.isPending || (!gdrive?.client_id && !form.client_id)}
            className="flex items-center gap-2 bg-white border border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {getAuthUrl.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
            Connect with Google
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> Saved</span>}
            <button onClick={handleSave} disabled={updateGDrive.isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
              {updateGDrive.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600 space-y-2">
        <p className="font-medium text-gray-700">Setup guide</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-500">
          <li>Go to Google Cloud Console → Create or select a project</li>
          <li>Enable the <strong>Google Drive API</strong></li>
          <li>Create <strong>OAuth 2.0 Client ID</strong> (Web application type)</li>
          <li>Add <code className="bg-gray-100 px-1 rounded">{window.location.origin + "/settings"}</code> as an Authorized redirect URI</li>
          <li>Paste Client ID and Client Secret above, then Save</li>
          <li>Click <strong>Connect with Google</strong> and authorize access</li>
        </ol>
        <p className="text-gray-400 mt-1">DVC format: <code>dvc remote add myremote gdrive://&lt;folder-id&gt;</code></p>
      </div>
    </div>
  );
}

// ── rclone folder browser ──────────────────────────────────────────────────────

function RcloneBrowser({
  remote, rootPath, onAdd,
}: {
  remote: string; provider?: string; rootPath: string;
  onAdd: (path: string, name: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const { data, isLoading, error } = useRcloneBrowse(remote, currentPath);
  const [pending, setPending] = useState<{ path: string; value: string } | null>(null);

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Breadcrumb toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-wrap">
        <button onClick={() => setCurrentPath("")}
          className="text-xs text-blue-600 hover:underline">root</button>
        {breadcrumbs.map((seg, i) => {
          const p = breadcrumbs.slice(0, i + 1).join("/");
          return (
            <span key={p} className="flex items-center gap-1">
              <span className="text-gray-300 text-xs">/</span>
              <button onClick={() => setCurrentPath(p)}
                className="text-xs text-blue-600 hover:underline">{seg}</button>
            </span>
          );
        })}
        {isLoading && <Loader2 size={12} className="animate-spin text-blue-500 ml-auto" />}
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-600 bg-red-50">
          {String((error as Error).message)}
        </div>
      )}

      <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
        {currentPath && (
          <button
            onClick={() => setCurrentPath(currentPath.split("/").slice(0, -1).join("/"))}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 text-left">
            <FolderOpen size={14} className="text-gray-300" /> ..
          </button>
        )}
        {data?.entries.length === 0 && (
          <p className="px-4 py-4 text-xs text-gray-400 text-center">Empty folder</p>
        )}
        {data?.entries.map((entry: RcloneEntry) => (
          <div key={entry.path}
            className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 group">
            <FolderOpen size={14}
              className={`flex-shrink-0 ${entry.is_dir ? "text-indigo-400" : "text-gray-300"}`} />
            {entry.is_dir ? (
              <button onClick={() => setCurrentPath(entry.path)}
                className="flex-1 text-sm text-left text-gray-800 hover:text-indigo-600 truncate">
                {entry.name}
              </button>
            ) : (
              <span className="flex-1 text-sm text-gray-500 truncate">{entry.name}</span>
            )}
            {entry.is_dir && (
              <button onClick={() => setPending({ path: entry.path, value: entry.name })}
                className="flex-shrink-0 flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-colors">
                <Plus size={11} /> Save as dataset
              </button>
            )}
          </div>
        ))}
      </div>

      {pending && (
        <div className="border-t border-gray-200 bg-indigo-50 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-mono truncate max-w-[160px]">{pending.path}</span>
          <input autoFocus type="text"
            value={pending.value}
            onChange={e => setPending(p => p ? { ...p, value: e.target.value } : null)}
            onKeyDown={e => {
              if (e.key === "Enter") { onAdd(pending.path, pending.value.trim()); setPending(null); }
              if (e.key === "Escape") setPending(null);
            }}
            placeholder="Dataset name…"
            className="flex-1 min-w-[120px] px-2 py-1.5 rounded border border-indigo-300 text-sm focus:outline-none"
          />
          <button onClick={() => { onAdd(pending.path, pending.value.trim()); setPending(null); }}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
            <Save size={11} /> Save
          </button>
          <button onClick={() => setPending(null)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Cloud Storage tab ──────────────────────────────────────────────────────────

function CloudStorageTab() {
  const { data: providers } = useRcloneProviders();
  const { data: remotes, isLoading: remotesLoading } = useRcloneRemotes();
  const deleteRemote = useDeleteRcloneRemote();
  const testRemote = useTestRcloneRemote();
  const authStart = useRcloneAuthStart();
  const authFinish = useRcloneAuthFinish();
  const { data: datasets } = useRcloneDatasets();
  const addDataset = useAddRcloneDataset();
  const deleteDataset = useDeleteRcloneDataset();

  // Add remote form
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [remoteName, setRemoteName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const { data: pollData } = useRcloneAuthPoll(sessionId);

  const resetForm = () => {
    setShowAddForm(false);
    setSessionId(null);
    setAuthUrl(null);
    setAuthError(null);
    setSelectedProvider("");
    setRemoteName("");
  };

  // When auth finishes, create the remote
  useEffect(() => {
    if (!pollData) return;
    if (pollData.error) {
      setAuthError(pollData.error);
      setSessionId(null);
      return;
    }
    if (pollData.done && pollData.token && sessionId && remoteName && selectedProvider) {
      authFinish.mutate({ session_id: sessionId, remote_name: remoteName, provider: selectedProvider });
      resetForm();
    }
  }, [pollData]);

  const handleStartAuth = async () => {
    if (!selectedProvider || !remoteName.trim()) return;
    setAuthError(null);
    try {
      const result = await authStart.mutateAsync(selectedProvider);
      setSessionId(result.session_id);
      if (result.url) {
        setAuthUrl(result.url);
        window.open(result.url, "_blank");
      } else {
        setAuthError("rclone did not return an auth URL. Make sure rclone is installed in the container.");
        setSessionId(null);
      }
    } catch (e: unknown) {
      setAuthError((e as Error).message ?? "Failed to start authorization");
    }
  };

  // Browser state: which remote is being browsed
  const [browsingRemote, setBrowsingRemote] = useState<{ name: string; provider: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "idle" | "loading" | "ok" | "error">>({});

  const handleTest = async (name: string) => {
    setTestResults(r => ({ ...r, [name]: "loading" }));
    try {
      await testRemote.mutateAsync(name);
      setTestResults(r => ({ ...r, [name]: "ok" }));
    } catch {
      setTestResults(r => ({ ...r, [name]: "error" }));
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Connected remotes ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Connected Services</h3>
          <button onClick={() => showAddForm ? resetForm() : setShowAddForm(true)}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={12} /> Add Service
          </button>
        </div>

        {/* Add service form */}
        {showAddForm && (
          <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                <select value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Choose provider…</option>
                  {providers?.map(p => (
                    <option key={p.type} value={p.type}>{p.label}</option>
                  ))}
                </select>
              </div>
              <Field label="Remote Name" value={remoteName} onChange={setRemoteName}
                placeholder="my-gdrive" hint="Identifier used internally" />
            </div>

            {/* Auth flow */}
            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-start gap-2">
                <XCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {!sessionId && (
              <div className="flex items-center gap-2 justify-end">
                <button onClick={resetForm}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={handleStartAuth}
                  disabled={!selectedProvider || !remoteName.trim() || authStart.isPending}
                  className="flex items-center gap-2 text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {authStart.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link size={13} />}
                  {authStart.isPending ? "Starting…" : "Authorize"}
                </button>
              </div>
            )}

            {sessionId && (
              <div className="space-y-2">
                {authUrl ? (
                  <div className="bg-white border border-indigo-200 rounded-lg px-4 py-3 text-xs space-y-2">
                    <p className="text-gray-700 font-medium">Browser window opened. Complete login there.</p>
                    <p className="text-gray-500">Didn't open? Click the link below:</p>
                    <a href={authUrl} target="_blank" rel="noopener noreferrer"
                      className="text-indigo-600 underline break-all">{authUrl}</a>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                    Waiting for rclone to generate auth URL…
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin text-indigo-500" />
                    Waiting for authorization…
                  </div>
                  <button onClick={resetForm}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {remotesLoading && <div className="text-center py-4 text-gray-400"><Loader2 size={16} className="animate-spin mx-auto" /></div>}

        {!remotesLoading && (!remotes || remotes.length === 0) && !showAddForm && (
          <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl text-sm">
            No cloud services connected. Click "Add Service" to get started.
          </div>
        )}

        {remotes?.map(remote => (
          <div key={remote.name}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 flex-shrink-0">
              <Cloud size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">{remote.name}</span>
                <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{remote.label}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => handleTest(remote.name)}
                  className="text-xs text-blue-600 hover:underline">Test</button>
                <ConnectionStatus status={testResults[remote.name] ?? "idle"} />
                <button onClick={() => setBrowsingRemote(r => r?.name === remote.name ? null : { name: remote.name, provider: remote.type })}
                  className="text-xs text-indigo-600 hover:underline">
                  {browsingRemote?.name === remote.name ? "Hide browser" : "Browse & add datasets"}
                </button>
              </div>
            </div>
            <button onClick={() => deleteRemote.mutate(remote.name)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Folder browser ── */}
      {browsingRemote && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Browse <span className="text-indigo-600">{browsingRemote.name}</span>
          </h3>
          <RcloneBrowser
            remote={browsingRemote.name}
            provider={browsingRemote.provider}
            rootPath=""
            onAdd={(path, name) => addDataset.mutate({
              name, remote: browsingRemote.name, path, provider: browsingRemote.provider,
            })}
          />
          {addDataset.isSuccess && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={11} /> Dataset saved
            </p>
          )}
        </div>
      )}

      {/* ── Cloud datasets ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Cloud Datasets
          {datasets && datasets.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {datasets.length}
            </span>
          )}
        </h3>
        {(!datasets || datasets.length === 0) ? (
          <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl text-sm">
            No cloud datasets yet. Browse a remote above and add folders.
          </div>
        ) : (
          <div className="space-y-2">
            {datasets.map(ds => (
              <div key={ds.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <Cloud size={16} className="text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{ds.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {ds.remote}:{ds.path}
                  </p>
                </div>
                <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  {ds.remote}
                </span>
                <button onClick={() => deleteDataset.mutate(ds.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Redmine tab ----

function RedmineTab() {
  const { data: redmine, isLoading } = useRedmineConfig();
  const updateRedmine = useUpdateRedmineConfig();
  const testRedmine = useTestRedmineConfig();

  const [form, setForm] = useState<{ url: string; api_key: string; verify_ssl: boolean }>({
    url: "", api_key: "", verify_ssl: true,
  });
  const [initialized, setInitialized] = useState(false);

  if (redmine && !initialized) {
    setForm({ url: redmine.url, api_key: "", verify_ssl: redmine.verify_ssl });
    setInitialized(true);
  }

  const handleSave = async () => {
    const payload: Record<string, unknown> = { url: form.url, verify_ssl: form.verify_ssl };
    if (form.api_key) payload.api_key = form.api_key;
    await updateRedmine.mutateAsync(payload as Parameters<typeof updateRedmine.mutateAsync>[0]);
  };

  const handleTest = () => {
    testRedmine.mutate({ url: form.url, api_key: form.api_key || "__use_saved__" });
  };

  const testStatus = testRedmine.isPending ? "loading" : testRedmine.isSuccess ? "ok" : testRedmine.isError ? "error" : "idle";

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
          <div className="p-2 bg-red-50 rounded-lg text-red-500">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path fill="white" d="M8 12h8M12 8v8" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Redmine</h2>
            <p className="text-xs text-gray-400">Kết nối Redmine để quản lý issues ngay trên dashboard</p>
          </div>
          {redmine?.api_key_set && (
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <CheckCircle size={11} /> Đã kết nối
            </span>
          )}
        </div>

        <Field
          label="Redmine URL"
          value={form.url}
          onChange={(v) => setForm({ ...form, url: v })}
          placeholder="http://localhost:3000 hoặc https://redmine.company.com"
          hint="URL của Redmine server (không cần dấu / ở cuối)"
        />
        <SecretInput
          label={redmine?.api_key_set ? "API Key (để trống để giữ nguyên)" : "API Key *"}
          value={form.api_key}
          onChange={(v) => setForm({ ...form, api_key: v })}
          placeholder={redmine?.api_key_set ? "••••••••••••••••" : "Lấy từ My account → API access key"}
          hint="Vào Redmine → My account → Show bên cạnh 'API access key'"
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="redmine-verify-ssl"
            checked={form.verify_ssl}
            onChange={(e) => setForm({ ...form, verify_ssl: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="redmine-verify-ssl" className="text-xs text-gray-600">
            Verify SSL certificate
          </label>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={updateRedmine.isPending || !form.url}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {updateRedmine.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Lưu
          </button>
          <button
            onClick={handleTest}
            disabled={testRedmine.isPending || !form.url}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Test kết nối
          </button>
          <ConnectionStatus
            status={testStatus}
            message={testRedmine.isSuccess
              ? `${testRedmine.data?.name?.trim() || testRedmine.data?.user} (${testRedmine.data?.user})`
              : testRedmine.error?.message}
          />
        </div>
        {updateRedmine.isSuccess && (
          <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={11} /> Đã lưu</p>
        )}
      </div>
    </div>
  );
}

// ---- Main page ----

export function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"projects" | "minio" | "ssh" | "gdrive" | "cloud" | "redmine">("projects");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate("/")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg text-gray-600"><Settings size={18} /></div>
            <h1 className="font-bold text-gray-900">Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit flex-wrap">
          <button
            onClick={() => setTab("projects")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "projects" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <GitBranch size={15} /> GitLab Projects
          </button>
          <button
            onClick={() => setTab("minio")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "minio" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <HardDrive size={15} /> MinIO
          </button>
          <button
            onClick={() => setTab("ssh")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "ssh" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Terminal size={15} /> SSH
          </button>
          <button
            onClick={() => setTab("gdrive")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "gdrive" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <FolderOpen size={15} /> Google Drive
          </button>
          <button
            onClick={() => setTab("cloud")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "cloud" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <Cloud size={15} /> Cloud Storage
          </button>
          <button
            onClick={() => setTab("redmine")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "redmine" ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path fill="white" d="M8 12h8M12 8v8" />
            </svg>
            Redmine
          </button>
        </div>

        {tab === "projects" && <ProjectsTab />}
        {tab === "minio" && <MinIOTab />}
        {tab === "ssh" && <SSHTab />}
        {tab === "gdrive" && <GDriveTab />}
        {tab === "cloud" && <CloudStorageTab />}
        {tab === "redmine" && <RedmineTab />}
      </main>
    </div>
  );
}
