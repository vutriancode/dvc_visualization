import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  GitLabProjectPublic, GitLabProjectCreate, GitLabProjectUpdate,
  MinIOConfigPublic, MinIOConfigUpdate,
} from "../types";

const api = axios.create({ baseURL: "/api" });

// --- Projects ---

export function useProjects() {
  return useQuery<GitLabProjectPublic[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await api.get("/config/projects");
      return data;
    },
  });
}

export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GitLabProjectCreate) => {
      const { data } = await api.post("/config/projects", payload);
      return data as GitLabProjectPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: GitLabProjectUpdate & { id: string }) => {
      const { data } = await api.put(`/config/projects/${id}`, payload);
      return data as GitLabProjectPublic;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/config/projects/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useTestProject() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/config/projects/${id}/test`);
      return data as { ok: boolean; project: string };
    },
  });
}

// --- MinIO ---

export function useMinioConfig() {
  return useQuery<MinIOConfigPublic>({
    queryKey: ["minio-config"],
    queryFn: async () => {
      const { data } = await api.get("/config/minio");
      return data;
    },
  });
}

export function useUpdateMinio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MinIOConfigUpdate) => {
      const { data } = await api.put("/config/minio", payload);
      return data as MinIOConfigPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["minio-config"] }),
  });
}

export function useTestMinio() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/config/minio/test");
      return data as { ok: boolean; bucket: string; bucket_exists: boolean };
    },
  });
}
