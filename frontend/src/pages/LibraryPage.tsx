import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVideos } from "@/api/client";
import VideoCard from "@/components/library/VideoCard";

function SkeletonCard() {
  return (
    <div className="panel p-4 animate-pulse flex flex-col gap-3">
      <div className="h-3.5 bg-studio-neutral/20 rounded w-3/4" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-2.5 bg-studio-neutral/15 rounded" />
        <div className="h-2.5 bg-studio-neutral/15 rounded" />
        <div className="h-2.5 bg-studio-neutral/15 rounded" />
      </div>
      <div className="h-6 bg-studio-neutral/10 rounded w-20 mt-2" />
    </div>
  );
}

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = (searchParams.get("mode") ?? "manual") as "manual" | "ai";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["videos"],
    queryFn: getVideos,
  });

  function handlePreviewToggle(videoId: string) {
    setActivePreviewId((prev) => (prev === videoId ? null : videoId));
  }

  function handleDeleted(videoId: string) {
    if (activePreviewId === videoId) setActivePreviewId(null);
    queryClient.invalidateQueries({ queryKey: ["videos"] });
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-studio-text">
            Video Library
          </h1>
          <p className="text-xs text-studio-neutral mt-0.5">
            {mode === "ai"
              ? "AI mode — describe edits in plain English."
              : "Manual mode — step-by-step control."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded border border-studio-neutral/20 overflow-hidden text-xs">
            <button
              onClick={() => setSearchParams({ mode: "manual" })}
              className={`px-3 py-1.5 font-medium transition-colors ${
                mode === "manual"
                  ? "bg-studio-neutral text-studio-text"
                  : "bg-studio-surface text-studio-neutral hover:bg-studio-surface-hover"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setSearchParams({ mode: "ai" })}
              className={`px-3 py-1.5 font-medium transition-colors ${
                mode === "ai"
                  ? "bg-studio-accent text-studio-text"
                  : "bg-studio-surface text-studio-neutral hover:bg-studio-surface-hover"
              }`}
            >
              AI
            </button>
          </div>

          <Link
            to="/upload"
            className="px-3 py-1.5 rounded bg-studio-accent hover:bg-studio-accent-hover text-studio-text text-xs font-medium transition-colors"
          >
            Upload
          </Link>
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="panel border-red-900/40 bg-red-900/10 p-4 text-xs">
          <p className="text-red-400 font-medium mb-1">Cannot reach backend.</p>
          <p className="text-red-500/80">
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <p className="mt-2 text-studio-neutral font-mono">
            uvicorn app.main:app --reload
          </p>
        </div>
      )}

      {/* Empty state */}
      {data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-10 h-10 bg-studio-surface border border-studio-neutral/20 rounded-lg flex items-center justify-center mb-4">
            <span className="text-xl">🎬</span>
          </div>
          <h2 className="text-sm font-semibold text-studio-text mb-1">No videos yet</h2>
          <p className="text-xs text-studio-neutral mb-5">Upload a video to get started.</p>
          <Link
            to="/upload"
            className="px-4 py-2 rounded bg-studio-accent hover:bg-studio-accent-hover text-studio-text text-xs font-medium transition-colors"
          >
            Upload your first video
          </Link>
        </div>
      )}

      {/* Video grid */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              mode={mode}
              isActive={activePreviewId === video.id}
              onPreviewToggle={() => handlePreviewToggle(video.id)}
              onDeleted={() => handleDeleted(video.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
