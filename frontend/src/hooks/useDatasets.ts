import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { Dataset, DatasetDetail, StatsResponse } from "../types";

const api = axios.create({ baseURL: "/api" });

export function useDatasets(projectId: string, search: string) {
  return useQuery<Dataset[]>({
    queryKey: ["datasets", projectId, search],
    queryFn: async () => {
      const { data } = await api.get("/datasets", {
        params: { project_id: projectId, ...(search ? { search } : {}) },
      });
      return data;
    },
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

export function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const { data } = await api.get("/datasets/stats");
      return data;
    },
  });
}
