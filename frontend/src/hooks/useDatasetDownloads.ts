import { useState, useEffect } from "react";
import { subscribe, getTasksForDataset, DownloadTask } from "../store/downloads";

/** Returns active download tasks for a specific dataset (live-updated). */
export function useDatasetDownloads(datasetId: string): DownloadTask[] {
  const [tasks, setTasks] = useState<DownloadTask[]>(() => getTasksForDataset(datasetId));

  useEffect(() => {
    return subscribe(() => setTasks(getTasksForDataset(datasetId)));
  }, [datasetId]);

  return tasks;
}
