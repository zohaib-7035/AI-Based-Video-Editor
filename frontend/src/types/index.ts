// ── Health ───────────────────────────────────────────────────────────────────

export type ServiceStatus = "ok" | "offline" | "error";

export interface ServicesStatus {
  database: ServiceStatus;
  ffmpeg: ServiceStatus;
  ollama: ServiceStatus;
  storage: ServiceStatus;
}

export interface HealthResponse {
  status: ServiceStatus;
  version: string;
  services: ServicesStatus;
}

export interface ApiError {
  message: string;
  detail?: string;
}

// ── Videos ───────────────────────────────────────────────────────────────────

export type VideoStatus = "uploaded" | "processing" | "ready" | "error";

export interface Video {
  id: string;
  filename: string;
  filepath: string;
  file_size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  format: string | null;
  status: VideoStatus;
  export_path: string | null;
  filler_export_path: string | null;
  encode_export_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface FillerSegment {
  word: string;
  start: number;
  end: number;
  duration: number;
}

export interface FillerDetection {
  id: string;
  video_id: string;
  segments: FillerSegment[];
  detected_at: string;
}

export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceDetection {
  id: string;
  video_id: string;
  segments: SilenceSegment[];
  detected_at: string;
}

export interface UploadState {
  file: File | null;
  progress: number;
  result: Video | null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

// ── AI Assistant ─────────────────────────────────────────────────────────────

export interface EditingCommand {
  action: "remove_silence" | "remove_fillers" | "generate_subtitles" | "export";
  params?: Record<string, unknown>;
}

export interface EditingPlan {
  commands: EditingCommand[];
  warnings: string[];
}

export type PlanStreamEvent =
  | { type: "delta"; content: string }
  | { type: "plan"; commands: EditingCommand[]; warnings: string[] }
  | { type: "error"; message: string };

export type ExportStreamEvent =
  | { type: "progress"; percent: number }
  | { type: "done"; download_url: string }
  | { type: "error"; message: string };

export type ExecutePlanStreamEvent =
  | { type: "progress"; step: number; total: number; action: string; status: "started" | "done" | "error" }
  | { type: "done"; executed_plan_path: string }
  | { type: "error"; action: string; detail: string }
  | { type: "warning"; action: string; detail: string };

export interface Transcript {
  id: string;
  video_id: string;
  text: string | null;
  segments: TranscriptSegment[];
  language: string | null;
  status: string;
  error: string | null;
  srt_path: string | null;
  vtt_path: string | null;
  created_at: string;
}
