import type { EditingCommand, ExecutePlanStreamEvent, ExportStreamEvent, FillerDetection, PlanStreamEvent, SilenceDetection, Transcript, Video } from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      message = err.detail ?? err.message ?? message;
    } catch {
      // response body was not JSON — use default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/**
 * Upload a video file with real-time progress tracking.
 *
 * Uses XMLHttpRequest instead of fetch because the fetch API does not expose
 * upload progress events. The onProgress callback receives a 0–100 percent value.
 */
export function uploadVideo(
  file: File,
  onProgress: (percent: number) => void,
): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Video);
        } catch {
          reject(new Error("Server returned invalid JSON."));
        }
      } else {
        let message = `HTTP ${xhr.status}`;
        try {
          const err = JSON.parse(xhr.responseText);
          message = err.detail ?? err.message ?? message;
        } catch {
          // non-JSON error body
        }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));

    // Do NOT set Content-Type manually — the browser must set the multipart
    // boundary automatically, otherwise the server cannot parse the request body.
    xhr.open("POST", `${BASE_URL}/api/v1/videos/upload`);
    xhr.send(formData);
  });
}

export function deleteVideo(videoId: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/api/v1/videos/${videoId}`);
}

export function getVideos(): Promise<Video[]> {
  return api.get<Video[]>("/api/v1/videos");
}

export function getStreamUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/stream`;
}

export function transcribeVideo(videoId: string): Promise<{ job: string; video_id: string }> {
  return api.post<{ job: string; video_id: string }>(`/api/v1/videos/${videoId}/transcribe`, {});
}

export function getTranscript(videoId: string): Promise<Transcript> {
  return api.get<Transcript>(`/api/v1/videos/${videoId}/transcript`);
}

export function createTranscriptionSocket(videoId: string): WebSocket {
  const wsBase = BASE_URL.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  return new WebSocket(`${wsBase}/api/v1/videos/${videoId}/transcribe/ws`);
}

export function getSubtitleSrtUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/subtitles/srt`;
}

export function getSubtitleVttUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/subtitles/vtt`;
}

export function generateSubtitles(videoId: string): Promise<{ srt_url: string; vtt_url: string }> {
  return api.post<{ srt_url: string; vtt_url: string }>(
    `/api/v1/videos/${videoId}/subtitles/generate`,
    {},
  );
}

export function detectSilence(videoId: string): Promise<SilenceDetection> {
  return api.post<SilenceDetection>(`/api/v1/videos/${videoId}/silence/detect`, {});
}

export function getSilence(videoId: string): Promise<SilenceDetection> {
  return api.get<SilenceDetection>(`/api/v1/videos/${videoId}/silence`);
}

export function removeSilence(videoId: string): Promise<{ export_url: string }> {
  return api.post<{ export_url: string }>(`/api/v1/videos/${videoId}/silence/remove`, {});
}

export function getExportStreamUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/silence/export/stream`;
}

export function detectFillers(videoId: string): Promise<FillerDetection> {
  return api.post<FillerDetection>(`/api/v1/videos/${videoId}/fillers/detect`, {});
}

export function getFillers(videoId: string): Promise<FillerDetection> {
  return api.get<FillerDetection>(`/api/v1/videos/${videoId}/fillers`);
}

export function removeFillers(videoId: string): Promise<{ export_url: string }> {
  return api.post<{ export_url: string }>(`/api/v1/videos/${videoId}/fillers/remove`, {});
}

export function getFillerExportStreamUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/fillers/export/stream`;
}

export async function* streamExport(
  videoId: string,
  resolution: string,
  signal: AbortSignal,
): AsyncGenerator<ExportStreamEvent> {
  const response = await fetch(`${BASE_URL}/api/v1/videos/${videoId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json() as { detail?: string; message?: string };
      message = err.detail ?? err.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as ExportStreamEvent;
          yield event;
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export function getExportDownloadUrl(videoId: string): string {
  return `${BASE_URL}/api/v1/videos/${videoId}/export/download`;
}

export async function* streamExecutePlan(
  videoId: string,
  commands: EditingCommand[],
  signal: AbortSignal,
): AsyncGenerator<ExecutePlanStreamEvent> {
  const response = await fetch(`${BASE_URL}/api/v1/videos/${videoId}/execute-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json() as { detail?: string; message?: string };
      message = err.detail ?? err.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as ExecutePlanStreamEvent;
          yield event;
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function* streamEditingPlan(
  videoId: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<PlanStreamEvent> {
  const response = await fetch(`${BASE_URL}/api/v1/videos/${videoId}/assistant/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json() as { detail?: string; message?: string };
      message = err.detail ?? err.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as PlanStreamEvent;
          yield event;
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
