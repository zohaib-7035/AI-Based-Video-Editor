import type { Video } from "@/types";
import { formatDuration } from "@/components/library/VideoCard";
import { formatTimecode } from "@/components/nle/DualMonitor";

const TOOL_LABEL: Record<string, string> = {
  select: "Selection",
  razor:  "Razor",
  slip:   "Slip",
  hand:   "Hand",
  zoom:   "Zoom",
};

interface StatusBarProps {
  video: Video | null;
  currentTime: number;
  activeTool: string;
  isPlaying: boolean;
}

export default function StatusBar({
  video,
  currentTime,
  activeTool,
  isPlaying,
}: StatusBarProps) {
  return (
    <footer className="flex items-center gap-4 px-4 h-6 bg-studio-surface border-t border-studio-neutral/15 shrink-0 select-none">
      {/* Playhead timecode */}
      <span className="text-[10px] text-studio-accent font-mono tracking-wider tabular-nums">
        {formatTimecode(currentTime)}
      </span>

      <div className="w-px h-3 bg-studio-neutral/20" />

      {/* Clip info */}
      {video ? (
        <>
          <span className="text-[10px] text-studio-neutral">
            {video.width && video.height ? `${video.width}×${video.height}` : "—"}
            {video.fps ? ` · ${video.fps} fps` : ""}
          </span>
          <div className="w-px h-3 bg-studio-neutral/20" />
          <span className="text-[10px] text-studio-neutral font-mono">
            {formatDuration(video.duration)}
          </span>
        </>
      ) : (
        <span className="text-[10px] text-studio-neutral/30">No clip</span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Active tool */}
      <span className="text-[9px] text-studio-neutral/50 uppercase tracking-widest">
        {TOOL_LABEL[activeTool] ?? activeTool}
      </span>

      <div className="w-px h-3 bg-studio-neutral/20" />

      {/* Playback indicator */}
      <span
        className={`text-[10px] font-mono ${isPlaying ? "text-studio-accent" : "text-studio-neutral/30"}`}
      >
        {isPlaying ? "▶ Playing" : "■ Stopped"}
      </span>

      <div className="w-px h-3 bg-studio-neutral/20" />

      <span className="text-[9px] text-studio-neutral/30 font-mono">v1.0.0</span>
    </footer>
  );
}
