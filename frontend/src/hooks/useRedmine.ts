import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  RedmineConfigPublic, RedmineConfigUpdate,
  RedmineProject, RedmineIssue, RedmineMeta, RedmineRef,
  RedmineStatsResponse, RedmineHoursResponse,
} from "../types";

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
  return resp.ok && resp.status !== 204 ? resp.json() : (undefined as unknown as T);
};

// ── Config ──────────────────────────────────────────────────────────────────

export function useRedmineConfig() {
  return useQuery<RedmineConfigPublic>({
    queryKey: ["redmine-config"],
    queryFn: () => api("/api/config/redmine"),
  });
}

export function useUpdateRedmineConfig() {
  const qc = useQueryClient();
  return useMutation<RedmineConfigPublic, Error, RedmineConfigUpdate>({
    mutationFn: (data) =>
      api("/api/config/redmine", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redmine-config"] }),
  });
}

export function useTestRedmineConfig() {
  return useMutation<{ ok: boolean; user: string; name: string }, Error, { url: string; api_key: string }>({
    mutationFn: (data) =>
      api("/api/config/redmine/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

// ── Projects ────────────────────────────────────────────────────────────────

export function useRedmineProjects() {
  return useQuery<RedmineProject[]>({
    queryKey: ["redmine-projects"],
    queryFn: () => api("/api/redmine/projects"),
    retry: false,
  });
}

export function useRedmineMembers(projectId: string | null) {
  return useQuery<RedmineRef[]>({
    queryKey: ["redmine-members", projectId],
    queryFn: () => api(`/api/redmine/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

export function useAllRedmineMembers(enabled = true) {
  return useQuery<RedmineRef[]>({
    queryKey: ["redmine-members-all"],
    queryFn: () => api("/api/redmine/members/all"),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Issues ──────────────────────────────────────────────────────────────────

export interface IssueFilters {
  project_id?: string;
  status_id?: string;
  tracker_id?: number;
  priority_id?: number;
  assigned_to_id?: number;
  limit?: number;
  offset?: number;
}

export function useRedmineIssues(filters: IssueFilters) {
  const params = new URLSearchParams();
  if (filters.project_id) params.set("project_id", filters.project_id);
  if (filters.status_id) params.set("status_id", filters.status_id);
  if (filters.tracker_id) params.set("tracker_id", String(filters.tracker_id));
  if (filters.priority_id) params.set("priority_id", String(filters.priority_id));
  if (filters.assigned_to_id) params.set("assigned_to_id", String(filters.assigned_to_id));
  params.set("limit", String(filters.limit ?? 100));
  params.set("offset", String(filters.offset ?? 0));

  return useQuery<{ issues: RedmineIssue[]; total_count: number }>({
    queryKey: ["redmine-issues", filters],
    queryFn: () => api(`/api/redmine/issues?${params}`),
    retry: false,
  });
}

export function useRedmineIssue(issueId: number | null) {
  return useQuery<RedmineIssue>({
    queryKey: ["redmine-issue", issueId],
    queryFn: () => api(`/api/redmine/issues/${issueId}`),
    enabled: !!issueId,
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation<RedmineIssue, Error, Record<string, unknown>>({
    mutationFn: (data) =>
      api("/api/redmine/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redmine-issues"] }),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; data: Record<string, unknown> }>({
    mutationFn: ({ id, data }) =>
      api(`/api/redmine/issues/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["redmine-issues"] });
      qc.invalidateQueries({ queryKey: ["redmine-issue", vars.id] });
    },
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => api(`/api/redmine/issues/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redmine-issues"] }),
  });
}

// ── Stats / Burndown ─────────────────────────────────────────────────────────

export interface StatsFilters {
  project_id?: string;
  member_ids: number[];
  tracker_ids?: number[];
  from_date?: string;
  to_date?: string;
}

export function useRedmineStats(filters: StatsFilters) {
  const params = new URLSearchParams();
  if (filters.project_id) params.set("project_id", filters.project_id);
  params.set("member_ids", filters.member_ids.join(","));
  if (filters.tracker_ids?.length) params.set("tracker_ids", filters.tracker_ids.join(","));
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);

  return useQuery<RedmineStatsResponse>({
    queryKey: ["redmine-stats", filters],
    queryFn: () => api(`/api/redmine/stats?${params}`),
    enabled: filters.member_ids.length > 0,
    retry: false,
  });
}

// ── Meta ────────────────────────────────────────────────────────────────────

export function useRedmineMeta() {
  return useQuery<RedmineMeta>({
    queryKey: ["redmine-meta"],
    queryFn: () => api("/api/redmine/meta"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// ── Working hours ────────────────────────────────────────────────────────────

export interface HoursFilters {
  project_id?: string;
  member_ids: number[];
  from_date?: string;
  to_date?: string;
}

export function useRedmineHours(filters: HoursFilters) {
  const params = new URLSearchParams();
  if (filters.project_id) params.set("project_id", filters.project_id);
  params.set("member_ids", filters.member_ids.join(","));
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);

  return useQuery<RedmineHoursResponse>({
    queryKey: ["redmine-hours", filters],
    queryFn: () => api(`/api/redmine/hours?${params}`),
    enabled: filters.member_ids.length > 0,
    retry: false,
  });
}

// ── Status mapping ───────────────────────────────────────────────────────────

export function useRedmineStatusMapping() {
  return useQuery<Record<string, string>>({
    queryKey: ["redmine-status-mapping"],
    queryFn: () => api("/api/config/redmine/status-mapping"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveRedmineStatusMapping() {
  const qc = useQueryClient();
  return useMutation<Record<string, string>, Error, Record<string, string>>({
    mutationFn: (mapping) =>
      api("/api/config/redmine/status-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["redmine-status-mapping"] });
      qc.invalidateQueries({ queryKey: ["redmine-stats"] });
    },
  });
}

// ── Export Time Entries ──────────────────────────────────────────────────────

export interface ExportReportParams {
  project_ids: string[];
  user_ids: number[];
  from_date: string;
  to_date: string;
}

async function downloadExcel(endpoint: string, params: ExportReportParams, fallbackFilename: string) {
  const p = new URLSearchParams();
  if (params.project_ids.length) p.set("project_ids", params.project_ids.join(","));
  p.set("user_ids", params.user_ids.join(","));
  p.set("from_date", params.from_date);
  p.set("to_date", params.to_date);

  const token = localStorage.getItem("dashboard_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${endpoint}?${p}`, { headers });
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = resp.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename\*=UTF-8''(.+)/i) ?? cd.match(/filename="?([^";\n]+)"?/i);
  a.download = match ? decodeURIComponent(match[1]) : fallbackFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportTimeEntries() {
  return useMutation<void, Error, ExportReportParams>({
    mutationFn: (params) => downloadExcel("/api/redmine/export/time-entries", params, "LogTime.xlsx"),
  });
}

export function useExportOTReport() {
  return useMutation<void, Error, ExportReportParams>({
    mutationFn: (params) => downloadExcel("/api/redmine/export/ot", params, "OT_Report.xlsx"),
  });
}

// ── Time Entries ─────────────────────────────────────────────────────────────

export interface LogTimeParams {
  issue_id: number;
  hours: number;
  spent_on: string;
  activity_id?: number;
  comments?: string;
}

export function useLogTime() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, LogTimeParams>({
    mutationFn: ({ issue_id, ...data }) =>
      api(`/api/redmine/issues/${issue_id}/time-entries`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["redmine-issue", vars.issue_id] });
      qc.invalidateQueries({ queryKey: ["redmine-issues"] });
      qc.invalidateQueries({ queryKey: ["redmine-logged-ids"] });
    },
  });
}

export interface LoggedIdsParams {
  project_id?: string;
  from_date?: string;
  to_date?: string;
  member_ids?: number[];
}

export function useLoggedIssueIds(params: LoggedIdsParams) {
  const p = new URLSearchParams();
  if (params.project_id) p.set("project_id", params.project_id);
  if (params.from_date) p.set("from_date", params.from_date);
  if (params.to_date) p.set("to_date", params.to_date);
  if (params.member_ids?.length) p.set("member_ids", params.member_ids.join(","));

  return useQuery<number[]>({
    queryKey: ["redmine-logged-ids", params],
    queryFn: () => api(`/api/redmine/logged-issue-ids?${p}`),
    // Chỉ fetch khi có member_ids — đảm bảo members đã load, tránh gọi không có user_id
    enabled: !!(params.from_date && params.to_date && params.member_ids?.length),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useTimeActivities() {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ["redmine-time-activities"],
    queryFn: () => api("/api/redmine/time-activities"),
    staleTime: 10 * 60 * 1000,
  });
}

// ── Hotfix / Sprint QA ───────────────────────────────────────────────────────

export interface HotfixData {
  all_issues: RedmineIssue[];
  qa_verified_today: RedmineIssue[];
  status_counts: Record<string, number>;
  today: string;
  project_id: string | null;
  query_id: number | null;
  total: number;
}

export interface CreateDeployTaskParams {
  project_id: string;
  issue_ids: number[];
}

export interface CreateDeployTaskResult {
  issue: RedmineIssue;
  relations_failed: number[];
}

export function useCreateDeployTask() {
  const qc = useQueryClient();
  return useMutation<CreateDeployTaskResult, Error, CreateDeployTaskParams>({
    mutationFn: (data) =>
      api("/api/redmine/hotfix/deploy-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redmine-hotfix"] }),
  });
}

export function useHotfixIssues(queryUrl: string, qaStatus: string = "QA Verified") {
  const params = new URLSearchParams();
  if (queryUrl) params.set("query_url", queryUrl);
  if (qaStatus) params.set("qa_status", qaStatus);

  return useQuery<HotfixData>({
    queryKey: ["redmine-hotfix", queryUrl, qaStatus],
    queryFn: () => api(`/api/redmine/hotfix?${params}`),
    enabled: !!queryUrl,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
