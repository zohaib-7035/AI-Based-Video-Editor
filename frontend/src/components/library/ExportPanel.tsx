import { useEffect, useRef, useState } from "react";
import { getExportDownloadUrl, streamExport } from "@/api/client";
import ProgressBar from "@/components/common/ProgressBar";

interface ExportPanelProps {
  videoId: string;
  onError: (message: string) => void;
}

export default function ExportPanel({ videoId, onError }: ExportPanelProps) {
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  async function handleExport() {
    if (isExporting) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    setProgress(null);
    setDownloadUrl(null);
    setError(null);
    onError("");

    try {
      for await (const event of streamExport(videoId, resolution, controller.signal)) {
        if (event.type === "progress") {
          setProgress(event.percent >= 0 ? event.percent : 0);
        } else if (event.type === "done") {
          setProgress(100);
          setDownloadUrl(getExportDownloadUrl(videoId));
        } else if (event.type === "error") {
          setError(event.message);
          onError(event.message);
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        const msg = err.message ?? "Export failed.";
        setError(msg);
        onError(msg);
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as "720p" | "1080p")}
          disabled={isExporting}
          className="rounded bg-studio-bg border border-studio-neutral/20 text-[10px] text-studio-muted font-mono px-1.5 py-0.5 focus:outline-none focus:border-studio-accent disabled:opacity-40 cursor-pointer"
        >
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
        </select>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-studio-neutral hover:bg-studio-neutral-hover text-studio-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isExporting ? "Exporting…" : "Export MP4"}
        </button>
      </div>

      {(isExporting || progress !== null) && downloadUrl === null && (
        <div className="w-full">
          <ProgressBar
            percent={progress ?? 0}
            label={progress !== null && progress > 0 ? `${progress}%` : "Encoding…"}
          />
        </div>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="text-[10px] text-studio-accent hover:text-studio-accent-hover transition-colors"
        >
          ↓ Download MP4
        </a>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
