export interface Dataset {
  id: string;
  name: string;
  dvc_file: string;
  path: string;
  md5: string | null;
  size: number | null;
  nfiles: number | null;
  last_modified: string | null;
  last_commit_message: string | null;
  last_author: string | null;
  version_count: number;
  project_id: string;
  project_name: string;
  gitlab_url: string;
  repo_path: string;
  source_type: "dvc" | "ssh" | "rclone";
  rclone_remote?: string;
  provider?: string;
}

export interface PresignedFile {
  name: string;
  size: number;
  url: string | null;
}

export interface DatasetVersion {
  commit_id: string;
  commit_short: string;
  message: string;
  author: string;
  authored_date: string;
  dvc_path: string;
  md5: string | null;
  size: number | null;
}

export interface DatasetDetail extends Dataset {
  versions: DatasetVersion[];
}

export interface MinioObject {
  name: string;
  size: number;
  last_modified: string;
  etag: string | null;
}

export interface StatsResponse {
  total_datasets: number;
  total_size_bytes: number;
  total_projects: number;
  minio_bucket: string;
}

export interface GitLabProjectPublic {
  id: string;
  name: string;
  gitlab_url: string;
  project_path: string;
  token_set: boolean;
  source_type: "project" | "group";
  branch: string;
}

export interface GitLabProjectCreate {
  name: string;
  gitlab_url: string;
  gitlab_token: string;
  project_path: string;
  source_type: "project" | "group";
  branch: string;
}

export interface GitLabProjectUpdate {
  name?: string;
  gitlab_url?: string;
  gitlab_token?: string;
  project_path?: string;
  source_type?: "project" | "group";
  branch?: string;
}

export interface MinIOConfigPublic {
  endpoint: string;
  access_key: string;
  secret_key_set: boolean;
  bucket: string;
  use_ssl: boolean;
}

export interface MinIOConfigUpdate {
  endpoint?: string;
  access_key?: string;
  secret_key?: string;
  bucket?: string;
  use_ssl?: boolean;
}

export interface SSHConfigPublic {
  host: string;
  port: number;
  username: string;
  password_set: boolean;
  private_key_set: boolean;
  remote_path: string;
}

export interface SSHConfigUpdate {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  private_key_pem?: string;
  remote_path?: string;
}

export interface GDriveConfigPublic {
  folder_id: string;
  client_id: string;
  client_secret_set: boolean;
  connected: boolean;
}

export interface GDriveConfigUpdate {
  folder_id?: string;
  client_id?: string;
  client_secret?: string;
}

export interface SSHEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface SSHBrowseResult {
  path: string;
  entries: SSHEntry[];
}

export interface SSHDataset {
  id: string;
  name: string;
  path: string;
}

export interface RcloneProvider {
  type: string;
  label: string;
  oauth: boolean;
}

export interface RcloneRemote {
  name: string;
  type: string;
  label: string;
}

export interface RcloneEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
}

export interface RcloneBrowseResult {
  remote: string;
  path: string;
  entries: RcloneEntry[];
}

export interface RcloneDataset {
  id: string;
  name: string;
  remote: string;
  path: string;
  provider: string;
}

export interface DatasetStat {
  name: string;
  dvc_file: string;
  path: string;
  size: number | null;
  nfiles: number | null;
  version_count: number;
  last_modified: string | null;
  last_author: string | null;
  last_commit_message: string | null;
  md5: string | null;
}

export interface AuthorStat {
  author: string;
  commits: number;
  datasets_touched: number;
  total_data_bytes: number;
}

export interface ProjectStats {
  project_id: string;
  project_name: string;
  gitlab_url: string;
  project_path: string;
  total_datasets: number;
  total_size_bytes: number;
  total_versions: number;
  total_files: number;
  datasets: DatasetStat[];
  author_stats: AuthorStat[];
}

// ── Redmine types ──────────────────────────────────────────────────────────

export interface RedmineConfigPublic {
  url: string;
  api_key_set: boolean;
  verify_ssl: boolean;
}

export interface RedmineConfigUpdate {
  url?: string;
  api_key?: string;
  verify_ssl?: boolean;
}

export interface RedmineRef {
  id: number;
  name: string;
}

export interface RedmineProject {
  id: number;
  identifier: string;
  name: string;
  description?: string;
  status: number;
  trackers?: RedmineRef[];
}

export interface RedmineIssue {
  id: number;
  subject: string;
  description?: string;
  project: RedmineRef;
  tracker: RedmineRef;
  status: RedmineStatus;
  priority: RedmineRef;
  author: RedmineRef;
  assigned_to?: RedmineRef;
  parent?: { id: number };
  done_ratio: number;
  estimated_hours?: number;
  spent_hours?: number;
  due_date?: string;
  created_on: string;
  updated_on: string;
  journals?: RedmineJournal[];
}

export interface RedmineJournal {
  id: number;
  user: RedmineRef;
  notes: string;
  created_on: string;
}

export interface RedmineStatus extends RedmineRef {
  is_closed: boolean;
}

export interface RedmineMeta {
  trackers: RedmineRef[];
  statuses: RedmineStatus[];
  priorities: RedmineRef[];
}

export interface RedmineMemberStat {
  id: number;
  name: string;
  total: number;
  remaining: number;  // tính từ is_closed của Redmine
  status_counts: Record<string, number>;
  overdue: number;
  burndown: { date: string; total: number; remaining: number }[];
}

export interface RedmineStatsResponse {
  members: RedmineMemberStat[];
  from_date: string;
  to_date: string;
  days: string[];
}

export interface RedmineMemberHours {
  id: number;
  name: string;
  total_actual: number;
  total_estimated: number;
  monthly: { month: string; actual: number; estimated: number }[];
}

export interface RedmineHoursResponse {
  members: RedmineMemberHours[];
  months: string[];
  from_date: string;
  to_date: string;
}

export interface ManagedProject {
  id: string;
  name: string;
  description: string;
  status: "active" | "planning" | "completed" | "paused";
  start_date: string;
  end_date: string;
  tags: string[];
  color: string;
  gitlab_config_id: string;
  ssh_dataset_ids: string[];
  rclone_dataset_ids: string[];
  redmine_project_id: string;
  cvat_links: CVATProjectLink[];
}

export interface ManagedProjectSummary {
  dataset_count: number;
  open_task_count: number;
  total_task_count: number;
  member_count: number;
}

export interface CVATProjectLink {
  cvat_project_id: number;
  gitlab_config_id: string;
  dvc_path: string;
  export_format: string;
}

// ── CVAT types ─────────────────────────────────────────────────────────────

export interface CVATConfigPublic {
  url: string;
  username: string;
  configured: boolean;
  verify_ssl: boolean;
}

export interface CVATConfigUpdate {
  url?: string;
  username?: string;
  password?: string;
  verify_ssl?: boolean;
}

export interface CVATProject {
  id: number;
  name: string;
  status?: string;
  created_date?: string;
  updated_date?: string;
}

export interface CVATUserStat {
  id: number;
  username: string;
  display_name: string;
  jobs_completed: number;
  frames_completed: number;
  frames_per_day: number;
}

export interface CVATTimelineEntry {
  period: string;
  users: Record<string, number>;
}

export interface CVATStatsResponse {
  project_id: number;
  from_date: string;
  to_date: string;
  group_by: string;
  total_jobs: number;
  total_frames: number;
  completed_jobs: number;
  completed_frames: number;
  progress_pct: number;
  state_counts: Record<string, number>;
  users: CVATUserStat[];
  timeline: CVATTimelineEntry[];
  user_ids_in_period: number[];
}
