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
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-900 text-green-300 border border-green-700">
          ready
        </span>
        <span className="text-white font-medium truncate">{video.filename}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ["Duration", formatDuration(video.duration)],
          ["Resolution", video.width && video.height ? `${video.width}×${video.height}` : "—"],
          ["FPS", video.fps ? `${video.fps}` : "—"],
          ["Codec", video.codec ?? "—"],
          ["Format", video.format ?? "—"],
          ["Size", formatBytes(video.file_size)],
        ].map(([label, value]) => (
          <div key={label} className="bg-gray-950 rounded-lg px-3 py-2">
            <p className="text-gray-500 text-xs mb-0.5">{label}</p>
            <p className="text-gray-200 font-mono text-xs">{value}</p>
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

  const handleFile = (file: File) => {
    mutation.mutate(file);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Upload Video</h1>
      <p className="text-gray-400 text-sm mb-8">
        Upload a video to start editing with AI.
      </p>

      {!mutation.isPending && !mutation.isSuccess && (
        <UploadZone onFile={handleFile} disabled={false} />
      )}

      {mutation.isPending && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-3">Uploading and analysing…</p>
            <ProgressBar percent={progress} label={`${progress}%`} />
          </div>
        </div>
      )}

      {mutation.isSuccess && mutation.data && (
        <div className="space-y-4">
          <VideoMetadataCard video={mutation.data} />
          <button
            onClick={() => mutation.reset()}
            className="text-sm text-violet-400 hover:text-violet-300 underline"
          >
            Upload another video
          </button>
        </div>
      )}

      {mutation.isError && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 space-y-3">
          <p className="text-red-300 text-sm">
            <strong>Upload failed.</strong>{" "}
            {mutation.error instanceof Error ? mutation.error.message : "Unknown error."}
          </p>
          <button
            onClick={() => mutation.reset()}
            className="text-sm text-red-400 hover:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
