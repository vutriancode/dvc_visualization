import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  RcloneProvider, RcloneRemote, RcloneBrowseResult, RcloneDataset,
} from "../types";

const api = axios.create({ baseURL: "/api" });

// Inject the auth token into every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dashboard_token");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export function useRcloneProviders() {
  return useQuery<RcloneProvider[]>({
    queryKey: ["rclone-providers"],
    queryFn: async () => {
      const { data } = await api.get("/rclone/providers");
      return data;
    },
    staleTime: Infinity,
  });
}

export function useRcloneRemotes() {
  return useQuery<RcloneRemote[]>({
    queryKey: ["rclone-remotes"],
    queryFn: async () => {
      const { data } = await api.get("/rclone/remotes");
      return data;
    },
  });
}

export function useDeleteRcloneRemote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/rclone/remotes/${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rclone-remotes"] });
      qc.invalidateQueries({ queryKey: ["rclone-datasets"] });
    },
  });
}

export function useTestRcloneRemote() {
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post(`/rclone/remotes/${name}/test`);
      return data as { ok: boolean };
    },
  });
}

export function useRcloneAuthStart() {
  return useMutation({
    mutationFn: async (provider: string) => {
      const { data } = await api.post("/rclone/auth/start", { provider });
      return data as { session_id: string; url: string | null };
    },
  });
}

export function useRcloneAuthPoll(sessionId: string | null) {
  return useQuery<{ done: boolean; url: string | null; token: string | null; error: string | null }>({
    queryKey: ["rclone-auth-poll", sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/rclone/auth/poll?session_id=${sessionId}`);
      return data;
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.done ? false : 2000;
    },
  });
}

export function useRcloneAuthFinish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { session_id: string; remote_name: string; provider: string }) => {
      const { data } = await api.post("/rclone/auth/finish", payload);
      return data as { ok: boolean; remote: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rclone-remotes"] }),
  });
}

export function useRcloneBrowse(remote: string | null, path: string) {
  return useQuery<RcloneBrowseResult>({
    queryKey: ["rclone-browse", remote, path],
    queryFn: async () => {
      const { data } = await api.get("/rclone/browse", { params: { remote, path } });
      return data;
    },
    enabled: !!remote,
    retry: false,
  });
}

export function useRcloneDatasets() {
  return useQuery<RcloneDataset[]>({
    queryKey: ["rclone-datasets"],
    queryFn: async () => {
      const { data } = await api.get("/rclone/datasets");
      return data;
    },
  });
}

export function useAddRcloneDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; remote: string; path: string; provider: string }) => {
      const { data } = await api.post("/rclone/datasets", payload);
      return data as RcloneDataset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rclone-datasets"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useDeleteRcloneDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rclone/datasets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rclone-datasets"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}
