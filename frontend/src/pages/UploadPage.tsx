import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadVideo } from "@/api/client";
import ProgressBar from "@/components/common/ProgressBar";
import UploadZone from "@/components/upload/UploadZone";
import type { Video } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VideoMetadataCard({ video }: { video: Video }) {
  const meta = [
    ["Duration", formatDuration(video.duration)],
    ["Resolution", video.width && video.height ? `${video.width}×${video.height}` : "—"],
    ["FPS", video.fps ? `${video.fps}` : "—"],
    ["Codec", video.codec ?? "—"],
    ["Format", video.format ?? "—"],
    ["Size", formatBytes(video.file_size)],
  ];

  return (
    <div className="panel p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-studio-accent/30 bg-studio-accent/10 text-[10px] font-medium text-studio-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-studio-accent" />
          ready
        </span>
        <span className="text-sm font-medium text-studio-text truncate">{video.filename}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {meta.map(([label, value]) => (
          <div key={label} className="bg-studio-bg rounded px-3 py-2 border border-studio-neutral/10">
            <p className="text-[10px] text-studio-neutral uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-xs text-studio-muted font-mono">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const [progress, setProgress] = useState(0);

  const mutation = useMutation<Video, Error, File>({
    mutationFn: (file: File) => uploadVideo(file, setProgress),
    onMutate: () => setProgress(0),
  });

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight text-studio-text mb-1">
        Upload Video
      </h1>
      <p className="text-xs text-studio-neutral mb-8">
        Upload a video to start editing with AI.
      </p>

      {!mutation.isPending && !mutation.isSuccess && (
        <UploadZone onFile={(f) => mutation.mutate(f)} disabled={false} />
      )}

      {mutation.isPending && (
        <div className="panel p-5">
          <p className="text-xs text-studio-neutral mb-4">Uploading and analysing…</p>
          <ProgressBar percent={progress} label={`${progress}%`} />
        </div>
      )}

      {mutation.isSuccess && mutation.data && (
        <div className="flex flex-col gap-4">
          <VideoMetadataCard video={mutation.data} />
          <button
            onClick={() => mutation.reset()}
            className="text-xs text-studio-accent hover:text-studio-accent-hover transition-colors self-start"
          >
            ← Upload another video
          </button>
        </div>
      )}

      {mutation.isError && (
        <div className="panel border-red-900/40 bg-red-900/10 p-4 flex flex-col gap-3">
          <p className="text-xs text-red-400">
            <span className="font-medium">Upload failed. </span>
            {mutation.error instanceof Error ? mutation.error.message : "Unknown error."}
          </p>
          <button
            onClick={() => mutation.reset()}
            className="text-xs text-studio-accent hover:text-studio-accent-hover transition-colors self-start"
          >
            ← Try again
          </button>
        </div>
      )}
    </div>
  );
}
