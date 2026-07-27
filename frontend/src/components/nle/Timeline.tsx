import { useMemo, useRef } from "react";
import type { FillerDetection, SilenceDetection, Video } from "@/types";

const TRACK_H = 40;
const HEADER_W = 112;
const PX_PER_SEC = 90;

interface TimelineProps {
  video: Video | null;
  silenceDetection: SilenceDetection | null;
  fillerDetection: FillerDetection | null;
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  activeTool: string;
  onToolChange: (tool: string) => void;
}

const TRACKS = [
  { id: "V2", type: "video", label: "V2" },
  { id: "V1", type: "video", label: "V1" },
  { id: "A1", type: "audio", label: "A1" },
  { id: "A2", type: "audio", label: "A2" },
];

const TOOLS = [
  { id: "select", label: "V", title: "Selection (V)" },
  { id: "razor",  label: "C", title: "Razor (C)" },
  { id: "slip",   label: "Y", title: "Slip (Y)" },
  { id: "hand",   label: "H", title: "Hand (H)" },
  { id: "zoom",   label: "Z", title: "Zoom (Z)" },
];

function formatRuler(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function deterministicWaveform(width: number, height: number, seed: number): string {
  const mid = height / 2;
  const steps = Math.max(4, Math.floor(width / 3));
  const top: string[] = [];
  const bot: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = ((i / steps) * width).toFixed(1);
    const t = i * 0.22 + seed;
    const amp =
      (Math.sin(t) * 0.45 +
        Math.sin(t * 2.1 + 1.3) * 0.25 +
        Math.cos(t * 0.8 + 0.5) * 0.15) *
      mid *
      0.78;
    top.push(`${x},${(mid - Math.abs(amp)).toFixed(1)}`);
    bot.unshift(`${x},${(mid + Math.abs(amp)).toFixed(1)}`);
  }
  return `M ${top.join(" L ")} L ${bot.join(" L ")} Z`;
}

export default function Timeline({
  video,
  silenceDetection,
  fillerDetection,
  currentTime,
  duration,
  onSeek,
  activeTool,
  onToolChange,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalW = Math.max(duration * PX_PER_SEC + 300, 800);

  /* Tick interval based on duration */
  const tickInterval = duration < 20 ? 1 : duration < 60 ? 5 : duration < 300 ? 10 : 30;
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= duration + tickInterval; t += tickInterval) arr.push(t);
    return arr;
  }, [duration, tickInterval]);

  /* Waveform path (deterministic from video id) */
  const waveformSeed = useMemo(() => {
    if (!video) return 0;
    return video.id.charCodeAt(0) * 0.37 + video.id.charCodeAt(1) * 0.13;
  }, [video]);

  const waveformPath = useMemo(() => {
    if (!video || duration <= 0) return "";
    const w = duration * PX_PER_SEC;
    return deterministicWaveform(w, TRACK_H - 8, waveformSeed);
  }, [video, duration, waveformSeed]);

  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const t = Math.max(0, Math.min(duration, x / PX_PER_SEC));
    onSeek(t);
  }

  const playheadLeft = currentTime * PX_PER_SEC;

  return (
    <div className="flex flex-col h-full bg-studio-bg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-studio-neutral/15 bg-studio-surface shrink-0 h-9">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            title={tool.title}
            onClick={() => onToolChange(tool.id)}
            className={`w-7 h-7 flex items-center justify-center rounded text-[11px] font-mono font-semibold transition-colors ${
              activeTool === tool.id
                ? "bg-studio-accent text-studio-text"
                : "text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover"
            }`}
          >
            {tool.label}
          </button>
        ))}

        <div className="w-px h-4 bg-studio-neutral/20 mx-1" />

        <button
          title="Toggle snap"
          className="w-7 h-7 flex items-center justify-center rounded text-[12px] text-studio-neutral hover:text-studio-muted hover:bg-studio-surface-hover transition-colors"
        >
          ⊟
        </button>

        <div className="ml-auto flex items-center gap-3 pr-1">
          {duration > 0 && (
            <span className="text-[9px] text-studio-neutral/50 font-mono">
              {formatRuler(duration)} total
            </span>
          )}
        </div>
      </div>

      {/* Track area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Fixed track headers */}
        <div
          className="flex flex-col shrink-0 bg-studio-surface border-r border-studio-neutral/15 z-10"
          style={{ width: HEADER_W }}
        >
          {/* Ruler spacer */}
          <div
            className="border-b border-studio-neutral/15"
            style={{ height: 22 }}
          />
          {TRACKS.map((track) => (
            <div
              key={track.id}
              className="flex items-center justify-between px-2.5 border-b border-studio-neutral/10 shrink-0"
              style={{
                height: TRACK_H,
                background:
                  track.type === "video"
                    ? "rgba(96,130,182,0.03)"
                    : "rgba(112,128,144,0.03)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-full py-2"
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <div
                    className="w-0.5 rounded-full"
                    style={{
                      height: "60%",
                      background:
                        track.type === "video"
                          ? "rgba(96,130,182,0.5)"
                          : "rgba(112,128,144,0.4)",
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-studio-neutral font-medium">
                  {track.label}
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  className="w-4 h-4 flex items-center justify-center text-[8px] text-studio-neutral/40 hover:text-studio-neutral rounded transition-colors"
                  title="Mute"
                >
                  M
                </button>
                <button
                  className="w-4 h-4 flex items-center justify-center text-[8px] text-studio-neutral/40 hover:text-studio-neutral rounded transition-colors"
                  title="Solo"
                >
                  S
                </button>
                <button
                  className="w-4 h-4 flex items-center justify-center text-[8px] text-studio-neutral/30 hover:text-studio-neutral rounded transition-colors"
                  title="Lock"
                >
                  ⬡
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          style={{ cursor: activeTool === "hand" ? "grab" : "crosshair" }}
        >
          <div className="relative" style={{ width: totalW }}>
            {/* Time ruler */}
            <div
              className="border-b border-studio-neutral/15 bg-studio-surface relative"
              style={{ height: 22 }}
              onClick={handleContentClick}
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: t * PX_PER_SEC }}
                >
                  <span className="text-[8px] text-studio-neutral/40 font-mono whitespace-nowrap ml-0.5 mb-0.5">
                    {formatRuler(t)}
                  </span>
                  <div className="w-px h-2 bg-studio-neutral/25" />
                </div>
              ))}
              {/* Sub-ticks */}
              {duration > 0 &&
                Array.from({ length: Math.ceil(duration / (tickInterval / 4)) }).map((_, i) => {
                  const t = (i * tickInterval) / 4;
                  if (t % tickInterval === 0) return null;
                  return (
                    <div
                      key={`sub-${i}`}
                      className="absolute bottom-0 w-px h-1 bg-studio-neutral/15"
                      style={{ left: t * PX_PER_SEC }}
                    />
                  );
                })}
            </div>

            {/* Track rows */}
            <div onClick={handleContentClick}>
              {TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="border-b border-studio-neutral/10 relative"
                  style={{
                    height: TRACK_H,
                    background:
                      track.type === "video"
                        ? "rgba(96,130,182,0.02)"
                        : "rgba(112,128,144,0.02)",
                  }}
                >
                  {/* Grid lines at tick marks */}
                  {ticks.map((t) => (
                    <div
                      key={t}
                      className="absolute top-0 bottom-0 w-px"
                      style={{ left: t * PX_PER_SEC, background: "rgba(112,128,144,0.06)" }}
                    />
                  ))}

                  {/* V1 video clip */}
                  {video && duration > 0 && track.id === "V1" && (
                    <div
                      className="absolute rounded overflow-hidden select-none"
                      style={{
                        top: 4,
                        left: 0,
                        width: duration * PX_PER_SEC,
                        height: TRACK_H - 8,
                        background: "linear-gradient(135deg, #3f5270 0%, #546685 100%)",
                        border: "1px solid rgba(96,130,182,0.45)",
                      }}
                    >
                      {/* Silence regions */}
                      {silenceDetection?.segments.map((seg, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: seg.start * PX_PER_SEC,
                            width: (seg.end - seg.start) * PX_PER_SEC,
                            background: "rgba(234,179,8,0.18)",
                            borderLeft: "1px solid rgba(234,179,8,0.4)",
                            borderRight: "1px solid rgba(234,179,8,0.4)",
                          }}
                        />
                      ))}
                      {/* Filler regions */}
                      {fillerDetection?.segments.map((seg, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: seg.start * PX_PER_SEC,
                            width: (seg.end - seg.start) * PX_PER_SEC,
                            background: "rgba(239,68,68,0.18)",
                            borderLeft: "1px solid rgba(239,68,68,0.4)",
                            borderRight: "1px solid rgba(239,68,68,0.4)",
                          }}
                        />
                      ))}
                      {/* Clip label */}
                      <span className="absolute left-1.5 top-1 text-[8px] text-white/60 font-mono truncate pointer-events-none" style={{ maxWidth: duration * PX_PER_SEC - 12 }}>
                        {video.filename}
                      </span>
                      {/* Diagonal stripe texture */}
                      <div
                        className="absolute inset-0 opacity-[0.06]"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 5px)",
                        }}
                      />
                    </div>
                  )}

                  {/* A1 audio clip (waveform) */}
                  {video && duration > 0 && track.id === "A1" && (
                    <div
                      className="absolute rounded overflow-hidden select-none"
                      style={{
                        top: 4,
                        left: 0,
                        width: duration * PX_PER_SEC,
                        height: TRACK_H - 8,
                        background: "linear-gradient(135deg, #344052 0%, #3e4e62 100%)",
                        border: "1px solid rgba(112,128,144,0.35)",
                      }}
                    >
                      {waveformPath && (
                        <svg
                          width={duration * PX_PER_SEC}
                          height={TRACK_H - 8}
                          viewBox={`0 0 ${duration * PX_PER_SEC} ${TRACK_H - 8}`}
                          preserveAspectRatio="none"
                          style={{ display: "block" }}
                        >
                          <path
                            d={waveformPath}
                            fill="rgba(96,130,182,0.38)"
                            stroke="rgba(96,130,182,0.55)"
                            strokeWidth="0.6"
                          />
                        </svg>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Playhead */}
            {duration > 0 && (
              <div
                className="absolute top-0 pointer-events-none"
                style={{
                  left: playheadLeft,
                  bottom: 0,
                  width: 1,
                  background: "#6082B6",
                  zIndex: 20,
                  boxShadow: "0 0 4px rgba(96,130,182,0.6)",
                }}
              >
                {/* Handle triangle */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: -5,
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "8px solid #6082B6",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      {(silenceDetection?.segments.length ?? 0) > 0 ||
        (fillerDetection?.segments.length ?? 0) > 0 ? (
        <div className="flex items-center gap-4 px-3 py-1 border-t border-studio-neutral/10 bg-studio-surface shrink-0">
          {(silenceDetection?.segments.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ background: "rgba(234,179,8,0.4)", border: "1px solid rgba(234,179,8,0.6)" }} />
              <span className="text-[9px] text-studio-neutral/60 uppercase tracking-wider">Silence</span>
            </div>
          )}
          {(fillerDetection?.segments.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ background: "rgba(239,68,68,0.4)", border: "1px solid rgba(239,68,68,0.6)" }} />
              <span className="text-[9px] text-studio-neutral/60 uppercase tracking-wider">Fillers</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
