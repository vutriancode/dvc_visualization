import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { ProjectStats } from "../types";

const api = axios.create({ baseURL: "/api" });

export function useProjectStats(projectId: string | null) {
  return useQuery<ProjectStats>({
    queryKey: ["project-stats", projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/stats`);
      return data;
    },
    enabled: !!projectId && projectId !== "all",
    staleTime: 120_000,
  });
}
