import { useState } from "react";
import type { Video } from "@/types";
import { formatDuration, formatSize } from "@/components/library/VideoCard";

interface MediaBinProps {
  videos: Video[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

const STATUS_DOT: Record<string, string> = {
  ready:      "bg-studio-accent",
  processing: "bg-yellow-500",
  uploaded:   "bg-studio-neutral",
  error:      "bg-red-500",
};

export default function MediaBin({ videos, selectedId, onSelect, isLoading }: MediaBinProps) {
  const [search, setSearch] = useState("");

  const filtered = videos.filter((v) =>
    v.filename.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-studio-neutral/15 shrink-0">
        <span className="section-label">Media</span>
        <span className="text-[9px] text-studio-neutral/40 font-mono">{videos.length} clips</span>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-studio-neutral/10 shrink-0">
        <input
          type="text"
          placeholder="Search clips…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-6 rounded bg-studio-bg border border-studio-neutral/20 text-[10px] text-studio-muted placeholder-studio-neutral/30 px-2 focus:outline-none focus:border-studio-accent transition-colors"
        />
      </div>

      {/* Clip list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col gap-1 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-studio-neutral/10 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
            <span className="text-xl" style={{ color: "rgba(112,128,144,0.2)" }}>
              &#9632;
            </span>
            <p className="text-[10px] text-studio-neutral/40">
              {videos.length === 0 ? "No clips imported" : "No results"}
            </p>
          </div>
        )}

        {!isLoading &&
          filtered.map((video) => {
            const isSelected = video.id === selectedId;
            return (
              <button
                key={video.id}
                onClick={() => onSelect(video.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 border-b border-studio-neutral/10 transition-colors text-left ${
                  isSelected
                    ? "bg-studio-accent/10 border-l-2 border-l-studio-accent pl-[6px]"
                    : "hover:bg-studio-surface-hover"
                }`}
              >
                {/* Thumbnail placeholder */}
                <div className="w-14 h-9 bg-studio-bg border border-studio-neutral/20 rounded flex items-center justify-center shrink-0 relative overflow-hidden">
                  <span className="text-[11px] text-studio-neutral/25">▶</span>
                  <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, #708090 0px, #708090 1px, transparent 1px, transparent 5px)",
                    }}
                  />
                </div>

                {/* Clip info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-studio-muted font-medium truncate leading-snug">
                    {video.filename}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[video.status] ?? "bg-studio-neutral"}`}
                    />
                    <span className="text-[9px] text-studio-neutral font-mono">
                      {formatDuration(video.duration)}
                    </span>
                    <span className="text-[9px] text-studio-neutral/40">·</span>
                    <span className="text-[9px] text-studio-neutral/50 truncate">
                      {formatSize(video.file_size)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      {/* Bins footer */}
      <div className="px-3 py-1.5 border-t border-studio-neutral/10 shrink-0">
        <span className="text-[9px] text-studio-neutral/30 uppercase tracking-widest">Project Bin</span>
      </div>
    </div>
  );
}
