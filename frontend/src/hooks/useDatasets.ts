import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { Dataset, DatasetDetail, StatsResponse, PresignedFile } from "../types";

const api = axios.create({ baseURL: "/api" });

export function useDatasets(projectId: string, search: string, branch: string = "") {
  return useQuery<Dataset[]>({
    queryKey: ["datasets", projectId, search, branch],
    queryFn: async () => {
      const { data } = await api.get("/datasets", {
        params: {
          project_id: projectId,
          ...(search ? { search } : {}),
          ...(branch ? { branch } : {}),
        },
      });
      return data;
    },
  });
}

export function useBranches(projectId: string | null, repoPath: string = "") {
  return useQuery<string[]>({
    queryKey: ["branches", projectId, repoPath],
    queryFn: async () => {
      if (!projectId || projectId === "all") return [];
      const { data } = await api.get(`/config/projects/${projectId}/branches`, {
        params: repoPath ? { repo_path: repoPath } : {},
      });
      return data as string[];
    },
    enabled: !!projectId && projectId !== "all",
    staleTime: 60_000,
  });
}

export function useGroupRepos(projectId: string | null) {
  return useQuery<{ path: string; name: string }[]>({
    queryKey: ["group-repos", projectId],
    queryFn: async () => {
      if (!projectId || projectId === "all") return [];
      const { data } = await api.get(`/config/projects/${projectId}/repos`);
      return data;
    },
    enabled: !!projectId && projectId !== "all",
    staleTime: 60_000,
  });
}

export function useRepoBranchDatasets(
  projectId: string,
  repoPath: string,
  branch: string,
) {
  return useQuery<Dataset[]>({
    queryKey: ["datasets-repo", projectId, repoPath, branch],
    queryFn: async () => {
      const { data } = await api.get("/datasets", {
        params: { project_id: projectId, sub_repo: repoPath, branch },
      });
      return data as Dataset[];
    },
    enabled: branch !== "",
  });
}

export function useDatasetDetail(projectId: string | undefined, datasetName: string | undefined) {
  return useQuery<DatasetDetail>({
    queryKey: ["dataset", projectId, datasetName],
    queryFn: async () => {
      const { data } = await api.get(`/datasets/${projectId}/${datasetName}/versions`);
      return data;
    },
    enabled: !!projectId && !!datasetName,
  });
}

export function usePresignedUrls() {
  return useMutation({
    mutationFn: async ({ projectId, datasetName }: { projectId: string; datasetName: string }) => {
      const { data } = await api.get(`/datasets/${projectId}/${datasetName}/presigned-urls`);
      return data as PresignedFile[];
    },
  });
}

export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const { data } = await api.get("/datasets/stats");
      return data;
    },
  });
}
