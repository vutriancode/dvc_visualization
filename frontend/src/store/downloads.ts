export type DownloadPhase = "zipping" | "downloading";

export interface DownloadTask {
  taskId: string;
  datasetId: string;
  filename: string;
  phase: DownloadPhase;
}

// Module-level state — persists across component mounts/unmounts
const _tasks = new Map<string, DownloadTask>();
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getTasks(): DownloadTask[] {
  return Array.from(_tasks.values());
}

export function getTasksForDataset(datasetId: string): DownloadTask[] {
  return Array.from(_tasks.values()).filter(t => t.datasetId === datasetId);
}

function _genId(): string {
  return `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Start a download, register it globally, trigger browser save when complete. */
export async function startDownload(
  datasetId: string,
  filename: string,
  fetchFn: () => Promise<Response>,
): Promise<void> {
  const taskId = _genId();
  _tasks.set(taskId, { taskId, datasetId, filename, phase: "zipping" });
  _notify();
  try {
    const resp = await fetchFn();
    if (!resp.ok) throw new Error(await resp.text());
    _tasks.set(taskId, { taskId, datasetId, filename, phase: "downloading" });
    _notify();
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } finally {
    _tasks.delete(taskId);
    _notify();
  }
}
