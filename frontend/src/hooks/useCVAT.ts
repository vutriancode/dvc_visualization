import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CVATConfigPublic, CVATConfigUpdate, CVATProject, CVATStatsResponse } from "../types";

const api = async <T>(url: string, opts?: RequestInit): Promise<T> => {
  const token = localStorage.getItem("dashboard_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(url, { ...opts, headers });
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return resp.status !== 204 ? resp.json() : (undefined as unknown as T);
};

export function useCVATConfig() {
  return useQuery<CVATConfigPublic>({
    queryKey: ["cvat-config"],
    queryFn: () => api("/api/config/cvat"),
  });
}

export function useUpdateCVATConfig() {
  const qc = useQueryClient();
  return useMutation<CVATConfigPublic, Error, CVATConfigUpdate>({
    mutationFn: (data) =>
      api("/api/config/cvat", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cvat-config"] }),
  });
}

export function useTestCVATConfig() {
  return useMutation<{ ok: boolean; username: string; name: string }, Error, { url: string; username: string; password: string }>({
    mutationFn: (data) =>
      api("/api/config/cvat/test", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useCVATProjects() {
  return useQuery<CVATProject[]>({
    queryKey: ["cvat-projects"],
    queryFn: () => api("/api/cvat/projects"),
    retry: false,
  });
}

export interface CVATStatsFilters {
  project_id: number | null;
  from_date: string;
  to_date: string;
  group_by: "day" | "week" | "month";
}

export function useCVATStats(filters: CVATStatsFilters) {
  const params = new URLSearchParams();
  if (filters.project_id != null) params.set("project_id", String(filters.project_id));
  params.set("from_date", filters.from_date);
  params.set("to_date", filters.to_date);
  params.set("group_by", filters.group_by);

  return useQuery<CVATStatsResponse>({
    queryKey: ["cvat-stats", filters],
    queryFn: () => api(`/api/cvat/stats?${params}`),
    enabled: filters.project_id != null && !!filters.from_date && !!filters.to_date,
    retry: false,
  });
}

export interface SyncToDVCParams {
  cvat_project_id: number;
  gitlab_config_id: string;
  dvc_path: string;
  export_format: string;
}

export interface SyncStep {
  name: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  message: string;
}

export interface SyncJobResult {
  ok: boolean;
  dvc_file: string;
  md5: string;
  size_bytes: number;
  zip_name: string;
  commit_id: string;
  commit_url: string;
}

export interface SyncJob {
  job_id: string;
  cvat_project_id: number;
  gitlab_config_id: string;
  dvc_path: string;
  export_format: string;
  status: "pending" | "running" | "done" | "error";
  steps: SyncStep[];
  result: SyncJobResult | null;
  error: string | null;
  created_at: string;
}

export function useSyncCVATtoDVC() {
  return useMutation<{ job_id: string; status: string }, Error, SyncToDVCParams>({
    mutationFn: (params) =>
      api("/api/cvat/sync-to-dvc", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  });
}

export function useSyncJob(jobId: string | null) {
  return useQuery<SyncJob>({
    queryKey: ["cvat-sync-job", jobId],
    queryFn: () => api(`/api/cvat/sync-jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "pending" || s === "running" ? 2000 : false;
    },
    staleTime: 0,
  });
}

export function useRetrySyncJob() {
  const qc = useQueryClient();
  return useMutation<{ job_id: string; status: string }, Error, string>({
    mutationFn: (jobId) =>
      api(`/api/cvat/sync-jobs/${jobId}/retry`, { method: "POST" }),
    onSuccess: (_data, jobId) => {
      qc.invalidateQueries({ queryKey: ["cvat-sync-job", jobId] });
    },
  });
}

export function useSyncJobsForProject(cvatProjectId: number | null) {
  return useQuery<SyncJob[]>({
    queryKey: ["cvat-sync-jobs", cvatProjectId],
    queryFn: () => api(`/api/cvat/sync-jobs?cvat_project_id=${cvatProjectId}`),
    enabled: cvatProjectId != null,
    staleTime: 5000,
  });
}
