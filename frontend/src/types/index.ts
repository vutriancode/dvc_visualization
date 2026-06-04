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
}

export interface GitLabProjectCreate {
  name: string;
  gitlab_url: string;
  gitlab_token: string;
  project_path: string;
}

export interface GitLabProjectUpdate {
  name?: string;
  gitlab_url?: string;
  gitlab_token?: string;
  project_path?: string;
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
}
