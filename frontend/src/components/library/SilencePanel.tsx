import type { SilenceDetection } from "@/types";

interface SilencePanelProps {
  silenceDetection: SilenceDetection | null;
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

export default function SilencePanel({
  silenceDetection,
  onDetect,
  onRemove,
  isDetecting,
  isRemoving,
  exportStreamUrl,
}: SilencePanelProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-studio-neutral/20 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="section-label">Silence Detection</span>
        <button
          onClick={onDetect}
          disabled={isDetecting}
          className="btn-secondary"
        >
          {isDetecting ? "Detecting…" : silenceDetection ? "Re-detect" : "Detect Silence"}
        </button>
      </div>

      {silenceDetection && (
        <>
          {silenceDetection.segments.length === 0 ? (
            exportStreamUrl ? (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-studio-accent">Silence removed — see preview below.</p>
                <button onClick={onRemove} disabled={isRemoving} className="btn-ghost">
                  {isRemoving ? "Removing…" : "Re-remove"}
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-studio-neutral italic">No silence detected in this video.</p>
            )
          ) : (
            <>
              {/* Segment table */}
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-1 text-[9px] text-studio-neutral uppercase tracking-widest px-2 pb-1">
                  <span>Start</span>
                  <span>End</span>
                  <span>Duration</span>
                </div>
                {silenceDetection.segments.map((seg, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-3 gap-1 text-[10px] text-studio-muted font-mono bg-studio-bg border border-studio-neutral/10 rounded px-2 py-1.5"
                  >
                    <span>{formatSeconds(seg.start)}</span>
                    <span>{formatSeconds(seg.end)}</span>
                    <span>{seg.duration.toFixed(2)}s</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onRemove}
                disabled={isRemoving}
                className="btn-primary self-start"
              >
                {isRemoving ? "Removing…" : "Remove Silence"}
              </button>
            </>
          )}
        </>
      )}

      {/* Preview */}
      {exportStreamUrl && (
        <div className="flex flex-col gap-2 pt-1 border-t border-studio-neutral/10">
          <span className="section-label">Processed Preview</span>
          <video controls className="w-full rounded" src={exportStreamUrl} />
        </div>
      )}
    </div>
  );
}
