import { useEffect, useRef } from "react";
import { getStreamUrl } from "@/api/client";
import type { Video } from "@/types";

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
    String(f).padStart(2, "0"),
  ].join(":");
}

interface SingleMonitorProps {
  label: string;
  src: string | null;
  currentTime: number;
  duration: number;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  onTimeUpdate?: (t: number) => void;
  onDurationChange?: (d: number) => void;
  seekFnRef?: React.MutableRefObject<((t: number) => void) | null>;
  readOnly?: boolean;
}

function SingleMonitor({
  label,
  src,
  currentTime,
  duration,
  isPlaying = false,
  onPlayToggle,
  onTimeUpdate,
  onDurationChange,
  seekFnRef,
  readOnly = false,
}: SingleMonitorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastUpdateRef = useRef(0);

  /* Expose seek function via ref */
  useEffect(() => {
    if (!seekFnRef) return;
    seekFnRef.current = (t: number) => {
      if (videoRef.current) videoRef.current.currentTime = t;
    };
    return () => {
      if (seekFnRef) seekFnRef.current = null;
    };
  });

  /* Sync play / pause from external state */
  useEffect(() => {
    if (!videoRef.current || readOnly) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, readOnly]);

  /* Reset video when src changes */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [src]);

  function handleTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    if (!onTimeUpdate) return;
    const now = performance.now();
    if (now - lastUpdateRef.current < 50) return;
    lastUpdateRef.current = now;
    onTimeUpdate((e.target as HTMLVideoElement).currentTime);
  }

  function handleDurationChange(e: React.SyntheticEvent<HTMLVideoElement>) {
    onDurationChange?.((e.target as HTMLVideoElement).duration || 0);
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    onTimeUpdate?.(t);
  }

  function handleGoStart() {
    if (videoRef.current) videoRef.current.currentTime = 0;
    onTimeUpdate?.(0);
  }
  function handleGoEnd() {
    if (videoRef.current) videoRef.current.currentTime = duration;
    onTimeUpdate?.(duration);
  }
  function handleStepBack() {
    if (videoRef.current) {
      const t = Math.max(0, videoRef.current.currentTime - 1 / 30);
      videoRef.current.currentTime = t;
      onTimeUpdate?.(t);
    }
  }
  function handleStepFwd() {
    if (videoRef.current) {
      const t = Math.min(duration, videoRef.current.currentTime + 1 / 30);
      videoRef.current.currentTime = t;
      onTimeUpdate?.(t);
    }
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-studio-neutral/15 last:border-r-0 overflow-hidden">
      {/* Monitor label bar */}
      <div className="flex items-center justify-between px-3 h-7 border-b border-studio-neutral/15 bg-studio-surface shrink-0">
        <span className="section-label">{label}</span>
        <span className="text-[9px] text-studio-neutral/50 font-mono">
          {duration > 0 ? formatTimecode(duration) : "--:--:--:--"}
        </span>
      </div>

      {/* Video display area */}
      <div className="flex-1 bg-[#080808] flex items-center justify-center relative overflow-hidden">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className="max-w-full max-h-full"
            style={{ objectFit: "contain", borderRadius: 0, background: "transparent" }}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onEnded={() => onPlayToggle?.()}
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ color: "rgba(112,128,144,0.18)" }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="currentColor">
              <rect x="1" y="7" width="38" height="27" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 14l12 6-12 6V14z" />
              <rect x="4" y="3" width="3" height="4" rx="0.5" />
              <rect x="9" y="3" width="3" height="4" rx="0.5" />
              <rect x="14" y="3" width="3" height="4" rx="0.5" />
              <rect x="19" y="3" width="3" height="4" rx="0.5" />
              <rect x="24" y="3" width="3" height="4" rx="0.5" />
              <rect x="29" y="3" width="3" height="4" rx="0.5" />
            </svg>
            <span className="text-[9px] font-mono uppercase tracking-widest">
              {label === "SOURCE" ? "No Source" : "No Output"}
            </span>
          </div>
        )}

        {/* Timecode overlay */}
        <div
          className="absolute bottom-2 left-2 rounded px-1.5 py-0.5"
          style={{ background: "rgba(0,0,0,0.75)" }}
        >
          <span className="text-[10px] text-studio-muted font-mono tracking-wider">
            {formatTimecode(currentTime)}
          </span>
        </div>

        {/* Safe area guides */}
        {src && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              border: "1px solid rgba(112,128,144,0.08)",
              margin: "8%",
            }}
          />
        )}
      </div>

      {/* Scrub bar */}
      <div className="px-2 pt-1.5 pb-0 shrink-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.033}
          value={currentTime}
          onChange={handleScrub}
          disabled={!src || duration === 0}
          className="nle-scrub w-full"
          style={{
            background: `linear-gradient(to right, #6082B6 ${progressPct}%, rgba(112,128,144,0.2) ${progressPct}%)`,
          }}
        />
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-0.5 px-2 py-1.5 shrink-0">
        <button
          onClick={handleGoStart}
          disabled={!src}
          className="w-7 h-7 flex items-center justify-center rounded text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover disabled:opacity-30 transition-colors text-xs"
          title="Go to start"
        >
          ⏮
        </button>
        <button
          onClick={handleStepBack}
          disabled={!src}
          className="w-7 h-7 flex items-center justify-center rounded text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover disabled:opacity-30 transition-colors text-xs"
          title="Step back one frame"
        >
          ◁
        </button>
        <button
          onClick={onPlayToggle}
          disabled={!src || readOnly}
          className="w-8 h-8 flex items-center justify-center rounded bg-studio-accent hover:bg-studio-accent-hover text-studio-text disabled:opacity-30 transition-colors text-xs mx-0.5"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "▐▐" : "▶"}
        </button>
        <button
          onClick={handleStepFwd}
          disabled={!src}
          className="w-7 h-7 flex items-center justify-center rounded text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover disabled:opacity-30 transition-colors text-xs"
          title="Step forward one frame"
        >
          ▷
        </button>
        <button
          onClick={handleGoEnd}
          disabled={!src}
          className="w-7 h-7 flex items-center justify-center rounded text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover disabled:opacity-30 transition-colors text-xs"
          title="Go to end"
        >
          ⏭
        </button>
      </div>
    </div>
  );
}

interface DualMonitorProps {
  video: Video | null;
  processedUrl: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (t: number) => void;
  onDurationChange: (d: number) => void;
  onPlayToggle: () => void;
  seekFnRef: React.MutableRefObject<((t: number) => void) | null>;
}

export default function DualMonitor({
  video,
  processedUrl,
  currentTime,
  duration,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onPlayToggle,
  seekFnRef,
}: DualMonitorProps) {
  const srcUrl = video ? getStreamUrl(video.id) : null;

  return (
    <div className="flex h-full">
      <SingleMonitor
        label="SOURCE"
        src={srcUrl}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onPlayToggle={onPlayToggle}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
        seekFnRef={seekFnRef}
      />
      <SingleMonitor
        label="PROGRAM"
        src={processedUrl}
        currentTime={0}
        duration={0}
        readOnly
      />
    </div>
  );
}
