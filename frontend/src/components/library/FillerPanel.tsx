import type { FillerDetection, Transcript } from "@/types";

interface FillerPanelProps {
  fillerDetection: FillerDetection | null;
  transcript: Transcript | null;
  onDetect: () => void;
  onRemove: () => void;
  isDetecting: boolean;
  isRemoving: boolean;
  exportStreamUrl: string | null;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
}

export default function FillerPanel({
  fillerDetection,
  transcript,
  onDetect,
  onRemove,
  isDetecting,
  isRemoving,
  exportStreamUrl,
}: FillerPanelProps) {
  const hasTranscript = transcript !== null && transcript.status === "completed";

  return (
    <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Filler Words
        </span>
        <button
          onClick={onDetect}
          disabled={isDetecting || !hasTranscript}
          title={!hasTranscript ? "Transcribe the video first" : undefined}
          className="px-3 py-1 rounded text-xs bg-purple-900 text-purple-200 hover:bg-purple-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!hasTranscript
            ? "Transcribe first"
            : isDetecting
            ? "Detecting…"
            : fillerDetection
            ? "Re-detect"
            : "Detect Fillers"}
        </button>
      </div>

      {fillerDetection && (
        <>
          {fillerDetection.segments.length === 0 ? (
            exportStreamUrl ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-400">Fillers removed — see preview below.</p>
                <button
                  onClick={onRemove}
                  disabled={isRemoving}
                  className="px-3 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {isRemoving ? "Removing…" : "Re-remove"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No filler words detected in this video.</p>
            )
          ) : (
            <>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                <div className="grid grid-cols-4 gap-1 text-[10px] text-gray-600 uppercase tracking-wide px-1">
                  <span>Word</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Duration</span>
                </div>
                {fillerDetection.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-4 gap-1 text-xs text-gray-300 bg-gray-800 rounded px-2 py-1"
                  >
                    <span className="text-purple-300 font-medium">{seg.word}</span>
                    <span>{formatSeconds(seg.start)}</span>
                    <span>{formatSeconds(seg.end)}</span>
                    <span>{seg.duration.toFixed(2)}s</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onRemove}
                disabled={isRemoving}
                className="px-3 py-1 rounded text-xs bg-red-900 text-red-200 hover:bg-red-800 transition-colors disabled:opacity-50 self-start"
              >
                {isRemoving ? "Removing…" : "Remove Fillers"}
              </button>
            </>
          )}
        </>
      )}

      {exportStreamUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Filler-Removed Preview
          </span>
          <video
            controls
            className="w-full rounded"
            src={exportStreamUrl}
          />
        </div>
      )}
    </div>
  );
}
