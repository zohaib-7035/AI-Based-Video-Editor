import { getSubtitleSrtUrl, getSubtitleVttUrl } from "@/api/client";
import type { Transcript } from "@/types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

interface TranscriptPanelProps {
  transcript: Transcript;
  videoId: string;
  onGenerateSubtitles: () => void;
  isGenerating: boolean;
}

export default function TranscriptPanel({
  transcript,
  videoId,
  onGenerateSubtitles,
  isGenerating,
}: TranscriptPanelProps) {
  const hasContent = !!transcript.text || transcript.segments.length > 0;

  return (
    <div className="bg-studio-bg border border-studio-neutral/10 rounded-lg p-3 flex flex-col gap-3">
      {!hasContent && (
        <p className="text-[10px] text-studio-neutral italic">No speech detected in this video.</p>
      )}

      {/* Full text */}
      {transcript.text && (
        <div className="max-h-28 overflow-y-auto">
          <p className="text-xs text-studio-muted leading-relaxed">{transcript.text}</p>
        </div>
      )}

      {/* Segment list */}
      {transcript.segments.length > 0 && (
        <>
          <hr />
          <ul className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {transcript.segments.map((seg, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="text-studio-neutral shrink-0 font-mono text-[10px]">
                  {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                </span>
                <span className="text-studio-muted">{seg.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Language tag */}
      {transcript.language && (
        <p className="text-[9px] text-studio-neutral uppercase tracking-widest font-mono">
          Language: {transcript.language}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap pt-1 border-t border-studio-neutral/10">
        {transcript.srt_path === null ? (
          <button
            onClick={onGenerateSubtitles}
            disabled={isGenerating}
            className="btn-primary"
          >
            {isGenerating ? "Generating…" : "Generate Subtitles"}
          </button>
        ) : (
          <>
            <a
              href={getSubtitleSrtUrl(videoId)}
              download
              className="btn-secondary"
            >
              ↓ SRT
            </a>
            <a
              href={getSubtitleVttUrl(videoId)}
              download
              className="btn-secondary"
            >
              ↓ VTT
            </a>
          </>
        )}
      </div>
    </div>
  );
}
