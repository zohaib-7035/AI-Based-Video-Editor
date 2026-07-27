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
    <div className="flex flex-col gap-3 border-t border-studio-neutral/20 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="section-label">Filler Words</span>
        <button
          onClick={onDetect}
          disabled={isDetecting || !hasTranscript}
          title={!hasTranscript ? "Transcribe the video first" : undefined}
          className="btn-secondary disabled:opacity-30"
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
                <p className="text-[10px] text-studio-accent">Fillers removed — see preview below.</p>
                <button onClick={onRemove} disabled={isRemoving} className="btn-ghost">
                  {isRemoving ? "Removing…" : "Re-remove"}
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-studio-neutral italic">No filler words detected.</p>
            )
          ) : (
            <>
              {/* Segment table */}
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                <div className="grid grid-cols-4 gap-1 text-[9px] text-studio-neutral uppercase tracking-widest px-2 pb-1">
                  <span>Word</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Duration</span>
                </div>
                {fillerDetection.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-4 gap-1 text-[10px] font-mono bg-studio-bg border border-studio-neutral/10 rounded px-2 py-1.5"
                  >
                    <span className="text-studio-accent font-medium">{seg.word}</span>
                    <span className="text-studio-muted">{formatSeconds(seg.start)}</span>
                    <span className="text-studio-muted">{formatSeconds(seg.end)}</span>
                    <span className="text-studio-muted">{seg.duration.toFixed(2)}s</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onRemove}
                disabled={isRemoving}
                className="btn-primary self-start"
              >
                {isRemoving ? "Removing…" : "Remove Fillers"}
              </button>
            </>
          )}
        </>
      )}

      {/* Preview */}
      {exportStreamUrl && (
        <div className="flex flex-col gap-2 pt-1 border-t border-studio-neutral/10">
          <span className="section-label">Filler-Removed Preview</span>
          <video controls className="w-full rounded" src={exportStreamUrl} />
        </div>
      )}
    </div>
  );
}
