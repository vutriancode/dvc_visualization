import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ManagedProject, ManagedProjectSummary } from "../types";

const api = async <T>(url: string, opts?: RequestInit): Promise<T> => {
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return resp.status !== 204 ? resp.json() : (undefined as unknown as T);
};

export function useManagedProjects() {
  return useQuery<ManagedProject[]>({
    queryKey: ["managed-projects"],
    queryFn: () => api("/api/managed-projects"),
  });
}

export function useManagedProject(id: string | null) {
  const { data: all } = useManagedProjects();
  return all?.find((p) => p.id === id) ?? null;
}

export function useManagedProjectSummary(id: string | null) {
  return useQuery<ManagedProjectSummary>({
    queryKey: ["managed-project-summary", id],
    queryFn: () => api(`/api/managed-projects/${id}/summary`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateManagedProject() {
  const qc = useQueryClient();
  return useMutation<ManagedProject, Error, Partial<ManagedProject>>({
    mutationFn: (data) =>
      api("/api/managed-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managed-projects"] }),
  });
}

export function useUpdateManagedProject() {
  const qc = useQueryClient();
  return useMutation<ManagedProject, Error, { id: string; data: Partial<ManagedProject> }>({
    mutationFn: ({ id, data }) =>
      api(`/api/managed-projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managed-projects"] }),
  });
}

export function useDeleteManagedProject() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api(`/api/managed-projects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managed-projects"] }),
  });
}
