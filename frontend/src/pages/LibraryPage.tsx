import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVideos } from "@/api/client";
import VideoCard from "@/components/library/VideoCard";

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse flex flex-col gap-3">
      <div className="h-4 bg-gray-700 rounded w-3/4" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-3 bg-gray-700 rounded" />
        <div className="h-3 bg-gray-700 rounded" />
        <div className="h-3 bg-gray-700 rounded" />
      </div>
      <div className="h-6 bg-gray-700 rounded w-20 mt-auto" />
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Library</h1>
          <p className="text-gray-400 text-sm mt-1">
            {mode === "ai" ? "AI Prompt Editing — describe what you want." : "Manual Editing — step-by-step control."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
            <button
              onClick={() => setSearchParams({ mode: "manual" })}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === "manual" ? "bg-violet-600 text-white" : "bg-gray-900 text-gray-400 hover:text-white"}`}
            >
              Manual
            </button>
            <button
              onClick={() => setSearchParams({ mode: "ai" })}
              className={`px-3 py-1.5 font-medium transition-colors ${mode === "ai" ? "bg-teal-600 text-white" : "bg-gray-900 text-gray-400 hover:text-white"}`}
            >
              AI
            </button>
          </div>
          <Link
            to="/upload"
            className="px-4 py-2 rounded bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            Upload
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {isError && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          <strong>Cannot reach backend.</strong>{" "}
          {error instanceof Error ? error.message : "Unknown error."}
          <p className="mt-1 text-red-400 text-xs">
            Make sure the backend is running: <code>uvicorn app.main:app --reload</code>
          </p>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <span className="text-2xl">🎬</span>
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">No videos yet</h2>
          <p className="text-gray-400 text-sm mb-4">Upload a video to get started.</p>
          <Link
            to="/upload"
            className="px-4 py-2 rounded bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            Upload your first video
          </Link>
        </div>
      )}

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
