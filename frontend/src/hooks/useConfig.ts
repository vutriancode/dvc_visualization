import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  GitLabProjectPublic, GitLabProjectCreate, GitLabProjectUpdate,
  MinIOConfigPublic, MinIOConfigUpdate,
  SSHConfigPublic, SSHConfigUpdate,
  GDriveConfigPublic, GDriveConfigUpdate,
  SSHBrowseResult, SSHDataset,
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

// --- SSH ---

export function useSSHConfig() {
  return useQuery<SSHConfigPublic>({
    queryKey: ["ssh-config"],
    queryFn: async () => {
      const { data } = await api.get("/config/ssh");
      return data;
    },
  });
}

export function useUpdateSSH() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SSHConfigUpdate) => {
      const { data } = await api.put("/config/ssh", payload);
      return data as SSHConfigPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-config"] }),
  });
}

export function useTestSSH() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/config/ssh/test");
      return data as { ok: boolean; host: string };
    },
  });
}

export function useSSHBrowse(path: string | null) {
  return useQuery<SSHBrowseResult>({
    queryKey: ["ssh-browse", path],
    queryFn: async () => {
      const { data } = await api.get("/storage/ssh/browse", { params: { path } });
      return data;
    },
    enabled: path !== null,
    retry: false,
  });
}

export function useSSHDatasets() {
  return useQuery<SSHDataset[]>({
    queryKey: ["ssh-datasets"],
    queryFn: async () => {
      const { data } = await api.get("/storage/ssh/datasets");
      return data;
    },
  });
}

export function useAddSSHDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; path: string }) => {
      const { data } = await api.post("/storage/ssh/datasets", payload);
      return data as SSHDataset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-datasets"] }),
  });
}

export function useDeleteSSHDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/storage/ssh/datasets/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-datasets"] }),
  });
}

// --- Google Drive ---

export function useGDriveConfig() {
  return useQuery<GDriveConfigPublic>({
    queryKey: ["gdrive-config"],
    queryFn: async () => {
      const { data } = await api.get("/config/gdrive");
      return data;
    },
  });
}

export function useUpdateGDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GDriveConfigUpdate) => {
      const { data } = await api.put("/config/gdrive", payload);
      return data as GDriveConfigPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gdrive-config"] }),
  });
}

export function useGDriveAuthUrl() {
  return useMutation({
    mutationFn: async (redirectUri: string) => {
      const { data } = await api.post("/config/gdrive/auth-url", { redirect_uri: redirectUri });
      return data as { url: string };
    },
  });
}

export function useGDriveExchangeCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, redirectUri }: { code: string; redirectUri: string }) => {
      const { data } = await api.post("/config/gdrive/exchange-code", {
        code,
        redirect_uri: redirectUri,
      });
      return data as GDriveConfigPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gdrive-config"] }),
  });
}

export function useGDriveDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/config/gdrive/disconnect");
      return data as GDriveConfigPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gdrive-config"] }),
  });
}

export function useTestGDrive() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/config/gdrive/test");
      return data as { ok: boolean; email: string; folder: string };
    },
  });
}
