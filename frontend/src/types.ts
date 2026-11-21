export type FormatInfo = {
  format_id: string;
  kind: "video" | "audio" | "video+audio";
  ext: string;
  quality: string;
  height: number;
  fps: number;
  vcodec: string | null;
  acodec: string | null;
  abr: number;
  tbr: number;
  filesize: number;
  filesize_text: string;
  note: string;
  language: string;
  protocol: string;
  dynamic_range: string;
  container: string;
};

export type MediaInfo = {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  uploader: string;
  uploader_url: string;
  duration: number;
  duration_text: string;
  view_count: number;
  like_count: number;
  upload_date: string;
  webpage_url: string;
  extractor: string;
  is_playlist: boolean;
  playlist_count: number;
  chapters: { start: number; end: number; title: string }[];
  subtitles: Record<string, string[]>;
  auto_subtitles: string[];
  videos: FormatInfo[];
  audios: FormatInfo[];
  muxed: FormatInfo[];
  best_video: FormatInfo | null;
  best_audio: FormatInfo | null;
  has_video: boolean;
  has_audio: boolean;
  demo?: boolean;
};

export type PlaylistInfo = {
  playlist: true;
  id: string;
  title: string;
  webpage_url: string;
  thumbnail: string | null;
  uploader: string;
  count: number;
  entries: {
    id: string;
    title: string;
    url: string;
    webpage_url: string;
    thumbnail: string | null;
    duration: number;
    duration_text: string;
    uploader: string;
  }[];
};

export type SearchItem = {
  id: string;
  title: string;
  url: string;
  webpage_url: string;
  thumbnail: string | null;
  duration: number;
  duration_text: string;
  uploader: string;
  view_count: number;
};

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export type Download = {
  id: number;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  dl_type: "video" | "audio";
  format_id: string;
  status: DownloadStatus;
  progress: number;
  speed: string;
  eta: string;
  filepath: string;
  filesize: number;
  error: string;
  filename_template: string;
  custom_args: string;
  created_at: number;
  finished_at: number | null;
};

export type Settings = Record<string, string>;

export type Template = { id: number; name: string; command: string; created_at: number };
export type Scheduled = {
  id: number;
  url: string;
  dl_type: string;
  format_id: string;
  run_at: number;
  status: string;
  created_at: number;
};
export type WatchItem = {
  id: number;
  url: string;
  title: string;
  last_checked: number;
  interval_hours: number;
  auto_download: number;
  created_at: number;
};
export type FileItem = { name: string; path: string; size: number; mtime: number; ext: string };
export type LogItem = { id: number; level: string; message: string; created_at: number };
export type Stats = { total: number; completed: number; failed: number; active: number; bytes: number };
export type Health = {
  ok: boolean;
  version: string;
  ytdlp: string;
  ffmpeg: boolean;
  ffmpeg_path: string;
  disk_free: number;
  disk_total: number;
  demo: boolean;
  active: number;
  queue: number;
};
