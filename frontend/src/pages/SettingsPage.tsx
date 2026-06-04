import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Settings, GitBranch, HardDrive, Eye, EyeOff,
  CheckCircle, XCircle, Loader2, Save, Plus, Trash2, Pencil, X,
} from "lucide-react";
import {
  useProjects, useAddProject, useUpdateProject, useDeleteProject, useTestProject,
  useMinioConfig, useUpdateMinio, useTestMinio,
} from "../hooks/useConfig";
import type { GitLabProjectCreate, GitLabProjectUpdate, GitLabProjectPublic, MinIOConfigUpdate } from "../types";

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

  return (
    <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/40 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Display Name" value={form.name} onChange={set("name")} placeholder="My ML Project" />
        <Field label="GitLab URL" value={form.gitlab_url} onChange={set("gitlab_url")} placeholder="https://gitlab.com" />
        <Field
          label="Project Path or ID"
          value={form.project_path}
          onChange={set("project_path")}
          placeholder="org/repo or 12345678"
          hint="namespace/project or numeric project ID"
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
            initial={{ name: project.name, gitlab_url: project.gitlab_url, gitlab_token: "", project_path: project.project_path }}
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
          initial={{ name: "", gitlab_url: "https://gitlab.com", gitlab_token: "", project_path: "" }}
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

// ---- Main page ----

export function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"projects" | "minio">("projects");

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
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
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
        </div>

        {tab === "projects" && <ProjectsTab />}
        {tab === "minio" && <MinIOTab />}
      </main>
    </div>
  );
}
