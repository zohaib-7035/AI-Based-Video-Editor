import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTranscriptionSocket,
  deleteVideo,
  detectFillers,
  detectSilence,
  generateSubtitles,
  getExportStreamUrl,
  getFillerExportStreamUrl,
  getFillers,
  getSilence,
  getStreamUrl,
  getSubtitleVttUrl,
  getTranscript,
  removeFillers,
  removeSilence,
  transcribeVideo,
} from "@/api/client";
import type { FillerDetection, SilenceDetection, Transcript, Video } from "@/types";
import ProgressBar from "@/components/common/ProgressBar";
import AssistantPanel from "@/components/library/AssistantPanel";
import ExportPanel from "@/components/library/ExportPanel";
import FillerPanel from "@/components/library/FillerPanel";
import SilencePanel from "@/components/library/SilencePanel";
import TranscriptPanel from "@/components/library/TranscriptPanel";

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

export function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface VideoCardProps {
  video: Video;
  mode?: "manual" | "ai";
  isActive: boolean;
  onPreviewToggle: () => void;
  onDeleted: () => void;
}

export default function VideoCard({ video, mode = "manual", isActive, onPreviewToggle, onDeleted }: VideoCardProps) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [silenceError, setSilenceError] = useState<string | null>(null);
  const [fillerError, setFillerError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  // Editable state tracked for undo/redo
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [silenceDetection, setSilenceDetection] = useState<SilenceDetection | null>(null);
  const [fillerDetection, setFillerDetection] = useState<FillerDetection | null>(null);

  // Undo/redo via refs (avoids stale closure issues in mutations/effects)
  type Snapshot = { transcript: Transcript | null; showTranscript: boolean; silenceDetection: SilenceDetection | null; fillerDetection: FillerDetection | null };
  const latestRef = useRef<Snapshot>({ transcript, showTranscript, silenceDetection, fillerDetection });
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Keep latestRef in sync with current state
  useEffect(() => {
    latestRef.current = { transcript, showTranscript, silenceDetection, fillerDetection };
  });

  function recordHistory() {
    historyRef.current.push({ ...latestRef.current });
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function handleUndo() {
    if (historyRef.current.length === 0) return;
    futureRef.current.unshift({ ...latestRef.current });
    const prev = historyRef.current.pop()!;
    setTranscript(prev.transcript);
    setShowTranscript(prev.showTranscript);
    setSilenceDetection(prev.silenceDetection);
    setFillerDetection(prev.fillerDetection);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }

  function handleRedo() {
    if (futureRef.current.length === 0) return;
    historyRef.current.push({ ...latestRef.current });
    const next = futureRef.current.shift()!;
    setTranscript(next.transcript);
    setShowTranscript(next.showTranscript);
    setSilenceDetection(next.silenceDetection);
    setFillerDetection(next.fillerDetection);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteVideo(video.id),
    onSuccess: () => {
      onDeleted();
      setConfirmDelete(false);
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
      setConfirmDelete(false);
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: () => transcribeVideo(video.id),
    onSuccess: () => {
      setTranscribeError(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => {
      setTranscribeError(err.message);
    },
  });

  const subtitleMutation = useMutation({
    mutationFn: () => generateSubtitles(video.id),
    onSuccess: () => {
      recordHistory();
      setSubtitleError(null);
      getTranscript(video.id).then(setTranscript).catch(() => {});
    },
    onError: (err: Error) => {
      setSubtitleError(err.message);
    },
  });

  const detectMutation = useMutation({
    mutationFn: () => detectSilence(video.id),
    onSuccess: () => {
      recordHistory();
      setSilenceError(null);
      getSilence(video.id).then(setSilenceDetection).catch(() => {});
    },
    onError: (err: Error) => {
      setSilenceError(err.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeSilence(video.id),
    onSuccess: () => {
      recordHistory();
      setSilenceError(null);
      setSilenceDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => {
      setSilenceError(err.message);
    },
  });

  const detectFillerMutation = useMutation({
    mutationFn: () => detectFillers(video.id),
    onSuccess: () => {
      recordHistory();
      setFillerError(null);
      getFillers(video.id).then(setFillerDetection).catch(() => {});
    },
    onError: (err: Error) => {
      setFillerError(err.message);
    },
  });

  const removeFillerMutation = useMutation({
    mutationFn: () => removeFillers(video.id),
    onSuccess: () => {
      recordHistory();
      setFillerError(null);
      setFillerDetection((prev) => (prev ? { ...prev, segments: [] } : null));
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => {
      setFillerError(err.message);
    },
  });

  // Reset CC state whenever the player opens so it matches the track's default mode.
  useEffect(() => {
    if (isActive) setCcEnabled(false);
  }, [isActive]);

  // Open WebSocket while transcription is in progress; clean up on unmount.
  useEffect(() => {
    if (video.status !== "processing") return;

    const ws = createTranscriptionSocket(video.id);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.status === "processing") {
        setTranscriptProgress(data.progress as number);
      } else if (data.status === "completed") {
        ws.close();
        setShowTranscript(true);
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else if (data.status === "error") {
        setTranscribeError((data.detail as string) ?? "Transcription failed");
        ws.close();
      }
    };

    ws.onerror = () => {
      setTranscribeError("WebSocket connection error");
    };

    return () => ws.close();
  }, [video.status, video.id, queryClient]);

  // Fetch saved transcript once the video is ready and we don't have it yet.
  useEffect(() => {
    if (video.status !== "ready" || transcript !== null) return;

    getTranscript(video.id)
      .then(setTranscript)
      .catch(() => {
        // No transcript yet — silently ignore (video may be ready but never transcribed).
      });
  }, [video.status, video.id, transcript]);

  // Restore silence detection state on mount if detection was previously run.
  useEffect(() => {
    if (video.status !== "ready" || silenceDetection !== null) return;

    getSilence(video.id)
      .then(setSilenceDetection)
      .catch(() => {
        // 404 means detection was never run — not an error.
      });
  }, [video.status, video.id, silenceDetection]);

  // Restore filler detection state on mount if detection was previously run.
  useEffect(() => {
    if (video.status !== "ready" || fillerDetection !== null) return;

    getFillers(video.id)
      .then(setFillerDetection)
      .catch(() => {
        // 404 means detection was never run — not an error.
      });
  }, [video.status, video.id, fillerDetection]);

  function toggleCC() {
    if (!videoRef.current) return;
    const track = videoRef.current.textTracks[0];
    if (!track) return;
    const next = !ccEnabled;
    track.mode = next ? "showing" : "hidden";
    setCcEnabled(next);
  }

  const hasSubtitles = transcript?.vtt_path != null;
  const showVideo = isActive || mode === "ai";

  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3"
      onMouseLeave={() => setConfirmDelete(false)}
    >
      {/* ── Header: filename + export button (top-right) ── */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white truncate" title={video.filename}>
          {video.filename}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {video.status === "ready" && (
            <ExportPanel
              videoId={video.id}
              onError={(msg) => setAssistantError(msg || null)}
            />
          )}
          <span className="text-xs text-gray-500">{video.status}</span>
        </div>
      </div>

      {/* ── Meta info ── */}
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div>
          <span className="block text-gray-600 uppercase tracking-wide text-[10px]">Duration</span>
          {formatDuration(video.duration)}
        </div>
        <div>
          <span className="block text-gray-600 uppercase tracking-wide text-[10px]">Size</span>
          {formatSize(video.file_size)}
        </div>
        <div>
          <span className="block text-gray-600 uppercase tracking-wide text-[10px]">Uploaded</span>
          {new Date(video.created_at).toLocaleDateString()}
        </div>
      </div>

      {/* ── Video player: always visible in AI mode, toggle in manual ── */}
      {showVideo && (
        <div className="flex flex-col gap-1">
          <video
            ref={videoRef}
            controls
            className="w-full rounded"
            src={getStreamUrl(video.id)}
          >
            {hasSubtitles && (
              <track kind="subtitles" src={getSubtitleVttUrl(video.id)} />
            )}
          </video>
          {hasSubtitles && (
            <div className="flex justify-end">
              <button
                onClick={toggleCC}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                  ccEnabled
                    ? "bg-white text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                CC
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual-only panels ── */}
      {mode === "manual" && showTranscript && transcript && (
        <TranscriptPanel
          transcript={transcript}
          videoId={video.id}
          onGenerateSubtitles={() => subtitleMutation.mutate()}
          isGenerating={subtitleMutation.isPending}
        />
      )}

      {mode === "manual" && video.status === "ready" && (
        <SilencePanel
          silenceDetection={silenceDetection}
          onDetect={() => detectMutation.mutate()}
          onRemove={() => removeMutation.mutate()}
          isDetecting={detectMutation.isPending}
          isRemoving={removeMutation.isPending}
          exportStreamUrl={video.export_path ? getExportStreamUrl(video.id) : null}
        />
      )}

      {mode === "manual" && video.status === "ready" && (
        <FillerPanel
          fillerDetection={fillerDetection}
          transcript={transcript}
          onDetect={() => detectFillerMutation.mutate()}
          onRemove={() => removeFillerMutation.mutate()}
          isDetecting={detectFillerMutation.isPending}
          isRemoving={removeFillerMutation.isPending}
          exportStreamUrl={video.filler_export_path ? getFillerExportStreamUrl(video.id) : null}
        />
      )}

      {/* ── AI-only panel ── */}
      {mode === "ai" && video.status === "ready" && (
        <AssistantPanel
          videoId={video.id}
          onError={(msg) => setAssistantError(msg || null)}
        />
      )}

      {/* ── Errors ── */}
      {(deleteError || transcribeError || subtitleError || silenceError || fillerError || assistantError) && (
        <div className="flex flex-col gap-1">
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
          {transcribeError && <p className="text-xs text-red-400">{transcribeError}</p>}
          {subtitleError && <p className="text-xs text-red-400">{subtitleError}</p>}
          {silenceError && <p className="text-xs text-red-400">{silenceError}</p>}
          {fillerError && <p className="text-xs text-red-400">{fillerError}</p>}
          {assistantError && <p className="text-xs text-red-400">{assistantError}</p>}
        </div>
      )}

      {/* ── Bottom action buttons ── */}
      <div className="flex flex-col gap-2 mt-auto pt-1">
        {video.status === "processing" ? (
          <ProgressBar percent={transcriptProgress} label="Transcribing…" />
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo / Redo */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo last action"
              className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↩ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo last undone action"
              className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↪ Redo
            </button>

            {mode === "manual" && (
              <button
                onClick={onPreviewToggle}
                className="px-3 py-1 rounded text-xs bg-violet-900 text-violet-200 hover:bg-violet-800 transition-colors"
              >
                {isActive ? "Hide Preview" : "Preview"}
              </button>
            )}

            {mode === "manual" && (
              transcript !== null ? (
                <button
                  onClick={() => setShowTranscript((s) => !s)}
                  className="px-3 py-1 rounded text-xs bg-teal-900 text-teal-200 hover:bg-teal-800 transition-colors"
                >
                  {showTranscript ? "Hide Transcript" : "View Transcript"}
                </button>
              ) : (
                <button
                  onClick={() => transcribeMutation.mutate()}
                  disabled={transcribeMutation.isPending}
                  className="px-3 py-1 rounded text-xs bg-indigo-900 text-indigo-200 hover:bg-indigo-800 transition-colors disabled:opacity-50"
                >
                  {transcribeMutation.isPending ? "Starting…" : "Transcribe"}
                </button>
              )
            )}

            {confirmDelete ? (
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-3 py-1 rounded text-xs bg-red-700 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting…" : "Confirm?"}
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
