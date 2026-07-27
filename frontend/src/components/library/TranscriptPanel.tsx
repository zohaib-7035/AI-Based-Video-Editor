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
    <div className="mt-3 bg-gray-950 border border-gray-800 rounded-lg p-3 flex flex-col gap-3">
      {!hasContent && (
        <p className="text-xs text-gray-500 italic">No speech detected in this video.</p>
      )}

      {transcript.text && (
        <div className="max-h-28 overflow-y-auto">
          <p className="text-xs text-gray-400 leading-relaxed">{transcript.text}</p>
        </div>
      )}

      {transcript.segments.length > 0 && (
        <>
          <hr className="border-gray-800" />
          <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {transcript.segments.map((seg, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="text-gray-600 shrink-0 font-mono">
                  {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                </span>
                <span className="text-gray-300">{seg.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {transcript.language && (
        <p className="text-[10px] text-gray-600 uppercase tracking-wide">
          Language: {transcript.language}
        </p>
      )}

      <div className="flex gap-2 flex-wrap pt-1">
        {transcript.srt_path === null ? (
          <button
            onClick={onGenerateSubtitles}
            disabled={isGenerating}
            className="px-3 py-1 rounded text-xs bg-amber-900 text-amber-200 hover:bg-amber-800 transition-colors disabled:opacity-50"
          >
            {isGenerating ? "Generating…" : "Generate Subtitles"}
          </button>
        ) : (
          <>
            <a
              href={getSubtitleSrtUrl(videoId)}
              download
              className="px-3 py-1 rounded text-xs bg-green-900 text-green-200 hover:bg-green-800 transition-colors"
            >
              Download SRT
            </a>
            <a
              href={getSubtitleVttUrl(videoId)}
              download
              className="px-3 py-1 rounded text-xs bg-green-900 text-green-200 hover:bg-green-800 transition-colors"
            >
              Download VTT
            </a>
          </>
        )}
      </div>
    </div>
  );
}
