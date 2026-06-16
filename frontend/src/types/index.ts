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
